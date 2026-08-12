import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateWithOpenAI } from './openaiGenerate.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: 'openai',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    hasKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })
})

app.post('/api/generate', async (req, res) => {
  try {
    const { clothDataUrl, backgroundMode, backgroundDataUrl, backgroundPrompt } = req.body ?? {}
    if (!clothDataUrl) {
      res.status(400).json({ error: 'clothDataUrl is required.' })
      return
    }

    const mode = backgroundMode === 'prompt' ? 'prompt' : 'photo'

    const image = await generateWithOpenAI({
      clothDataUrl,
      backgroundMode: mode,
      backgroundDataUrl,
      backgroundPrompt,
    })
    res.json({
      imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed.'
    const status = /Missing OPENAI_API_KEY/i.test(message) ? 503 : 500
    res.status(status).json({ error: message })
  }
})

// Production: serve the Vite build
const distDir = path.join(root, 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.method !== 'GET') return next()
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next()
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Modellr API listening on http://0.0.0.0:${port}`)
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn('Warning: OPENAI_API_KEY is not set')
  }
})
