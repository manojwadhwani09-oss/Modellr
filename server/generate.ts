import type { Connect, Plugin } from 'vite'
import type { ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

type GenerateBody = {
  clothDataUrl: string
  backgroundId: string
}

const MODEL = 'gemini-2.5-flash-image'
const PROMPT = `Create a photorealistic fashion photoshoot of a real human model wearing the exact garment from Image 1.

Preserve every garment detail precisely: fabric color, print/pattern, neckline, sleeves, length, trims, and fit. Do not invent a different design.

Place the model naturally in the scene from Image 2. Use Image 2 as the photoshoot background and environment — keep its lighting, furniture, architecture, and atmosphere.

Requirements:
- Real human model (not a mannequin), natural pose facing camera
- High resolution, sharp fabric texture and print detail
- Professional ecommerce / lifestyle fashion photography
- Output a single vertical portrait photo (3:4)`

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid image data. Please upload a valid photo.')
  }
  return { mimeType: match[1], data: match[2] }
}

function readBackground(backgroundId: string, root: string): { mimeType: string; data: string } {
  const safeId = backgroundId.replace(/[^a-zA-Z0-9_-]/g, '')
  const filePath = join(root, 'public', 'Background', `${safeId}.jpg`)
  if (!existsSync(filePath)) {
    throw new Error(`Background "${backgroundId}" not found.`)
  }
  return {
    mimeType: 'image/jpeg',
    data: readFileSync(filePath).toString('base64'),
  }
}

async function readJsonBody(req: Connect.IncomingMessage): Promise<GenerateBody> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) throw new Error('Empty request body.')
  return JSON.parse(raw) as GenerateBody
}

async function generateWithGemini(
  apiKey: string,
  cloth: { mimeType: string; data: string },
  background: { mimeType: string; data: string },
): Promise<{ mimeType: string; data: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: cloth.mimeType, data: cloth.data } },
            { inline_data: { mime_type: background.mimeType, data: background.data } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string }
          inline_data?: { mime_type?: string; data?: string }
        }>
      }
    }>
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini API error (${response.status})`)
  }

  const parts = payload.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data
    if (inline?.data) {
      return {
        mimeType:
          ('mimeType' in inline && inline.mimeType) ||
          ('mime_type' in inline && inline.mime_type) ||
          'image/png',
        data: inline.data,
      }
    }
  }

  throw new Error('No image was returned. Try another cloth photo or background.')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function modellrApiPlugin(): Plugin {
  return {
    name: 'modellr-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/api/generate' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const apiKey = process.env.GEMINI_API_KEY?.trim()
          if (!apiKey) {
            sendJson(res, 503, {
              error:
                'Missing GEMINI_API_KEY. Add it to a .env file in the project root, then restart npm run dev.',
            })
            return
          }

          const body = await readJsonBody(req)
          if (!body.clothDataUrl || !body.backgroundId) {
            sendJson(res, 400, { error: 'clothDataUrl and backgroundId are required.' })
            return
          }

          const cloth = parseDataUrl(body.clothDataUrl)
          const background = readBackground(body.backgroundId, server.config.root)
          const image = await generateWithGemini(apiKey, cloth, background)

          sendJson(res, 200, {
            imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Generation failed.'
          sendJson(res, 500, { error: message })
        }
      })
    },
  }
}
