import OpenAI, { toFile } from 'openai'

export type BackgroundMode = 'photo' | 'prompt'

export type GenerateInput = {
  clothDataUrl: string
  backgroundMode: BackgroundMode
  backgroundDataUrl?: string | null
  backgroundPrompt?: string | null
}

function buildPrompt(mode: BackgroundMode, backgroundPrompt?: string | null): string {
  const garmentRules = `Create a photorealistic fashion photoshoot of a real human model wearing the exact garment from the reference cloth photo.

Preserve every garment detail precisely: fabric color, print/pattern, neckline, sleeves, length, trims, and fit. Do not invent a different design.

Requirements:
- Real human model (not a mannequin), natural pose facing camera
- High resolution, sharp fabric texture and print detail
- Professional ecommerce / lifestyle fashion photography
- Vertical portrait composition`

  if (mode === 'photo') {
    return `${garmentRules}

Place the model naturally in the scene from the background reference photo. Keep that background's lighting, atmosphere, furniture/architecture, and setting.`
  }

  const scene = backgroundPrompt?.trim() || 'a natural outdoor fashion photoshoot location'
  return `${garmentRules}

Background / scene (follow this description): ${scene}`
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer; ext: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid image data. Please upload a valid photo.')
  }
  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const ext =
    mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
  return { mimeType, buffer, ext }
}

function friendlyOpenAIError(error: unknown): string {
  const err = error as {
    message?: string
    status?: number
    code?: string
    error?: { message?: string; code?: string; type?: string }
  }
  const message = err?.error?.message || err?.message || String(error)
  const status = err?.status
  const code = err?.error?.code || err?.code

  if (status === 401 || /invalid.?api.?key|incorrect api key/i.test(message)) {
    return 'Invalid OPENAI_API_KEY. Create one at https://platform.openai.com/api-keys'
  }
  if (
    status === 429 ||
    /rate.?limit|quota|billing|insufficient_quota/i.test(message) ||
    code === 'insufficient_quota'
  ) {
    return 'OpenAI quota/billing issue. Check https://platform.openai.com/account/billing'
  }
  if (/model.*not.*found|does not have access/i.test(message)) {
    return 'This OpenAI account cannot use the image model. Enable gpt-image access in your OpenAI project, or set OPENAI_IMAGE_MODEL in .env.'
  }
  return message || 'OpenAI image generation failed.'
}

export async function generateWithOpenAI(
  input: GenerateInput,
): Promise<{ mimeType: string; data: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Add it to .env, then restart the API server.')
  }

  const mode = input.backgroundMode
  if (mode === 'photo' && !input.backgroundDataUrl) {
    throw new Error('Background photo mode requires a background image.')
  }
  if (mode === 'prompt' && !input.backgroundPrompt?.trim()) {
    throw new Error('Prompt background mode requires a background description.')
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'
  const size = (process.env.OPENAI_IMAGE_SIZE?.trim() || '1024x1536') as
    | '1024x1024'
    | '1024x1536'
    | '1536x1024'
    | 'auto'
  const quality = (process.env.OPENAI_IMAGE_QUALITY?.trim() || 'medium') as
    | 'low'
    | 'medium'
    | 'high'
    | 'auto'

  const cloth = parseDataUrl(input.clothDataUrl)
  const client = new OpenAI({ apiKey })
  const prompt = buildPrompt(mode, input.backgroundPrompt)

  const images = [await toFile(cloth.buffer, `cloth.${cloth.ext}`, { type: cloth.mimeType })]

  if (mode === 'photo' && input.backgroundDataUrl) {
    const background = parseDataUrl(input.backgroundDataUrl)
    images.push(
      await toFile(background.buffer, `background.${background.ext}`, {
        type: background.mimeType,
      }),
    )
  }

  try {
    const result = await client.images.edit({
      model,
      prompt,
      image: images,
      size,
      quality,
      input_fidelity: 'high',
      n: 1,
    })

    const imageBase64 = result.data?.[0]?.b64_json
    if (!imageBase64) {
      const url = result.data?.[0]?.url
      if (url) {
        const res = await fetch(url)
        if (!res.ok) throw new Error('Could not download the generated image from OpenAI.')
        const mimeType = res.headers.get('content-type') || 'image/png'
        const data = Buffer.from(await res.arrayBuffer()).toString('base64')
        return { mimeType, data }
      }
      throw new Error('OpenAI returned no image.')
    }

    return { mimeType: 'image/png', data: imageBase64 }
  } catch (error) {
    throw new Error(friendlyOpenAIError(error))
  }
}
