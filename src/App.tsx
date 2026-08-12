import { useRef, useState } from 'react'
import { FILE_ACCEPT, normalizeClothImage } from './lib/normalizeImage'
import './App.css'

type Status = 'idle' | 'loading' | 'done' | 'error'
type BackgroundMode = 'photo' | 'prompt'

const MAX_BYTES = 20 * 1024 * 1024
const DOWNLOAD_NAME = 'modellr-model-photo.png'

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);/)?.[1] || 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

async function saveImageToDevice(dataUrl: string) {
  const file = dataUrlToFile(dataUrl, DOWNLOAD_NAME)

  // Phones: Share sheet lets users save to Photos / Files (HTML download is unreliable).
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Modellr photo' })
    return
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = DOWNLOAD_NAME
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Delay revoke so Safari can finish reading the blob.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
  }
}

export default function App() {
  const clothInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)

  const [clothPreview, setClothPreview] = useState<string | null>(null)
  const [clothDataUrl, setClothDataUrl] = useState<string | null>(null)
  const [clothName, setClothName] = useState<string | null>(null)

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('photo')
  const [backgroundDataUrl, setBackgroundDataUrl] = useState<string | null>(null)
  const [backgroundName, setBackgroundName] = useState<string | null>(null)
  const [backgroundPrompt, setBackgroundPrompt] = useState('')

  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [converting, setConverting] = useState<'cloth' | 'background' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function clearBackgroundFile() {
    setBackgroundDataUrl(null)
    setBackgroundName(null)
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
  }

  function selectMode(mode: BackgroundMode) {
    setBackgroundMode(mode)
    setError(null)
    setResultUrl(null)
    setStatus('idle')
    if (mode !== 'photo') clearBackgroundFile()
    if (mode !== 'prompt') setBackgroundPrompt('')
  }

  async function prepareImage(file: File | undefined, kind: 'cloth' | 'background') {
    if (!file) return
    setError(null)
    setResultUrl(null)
    setStatus('idle')

    if (file.size > MAX_BYTES) {
      setError('Photo is too large. Please use an image under 20 MB.')
      return
    }

    try {
      setConverting(kind)
      const dataUrl = await normalizeClothImage(file)
      if (kind === 'cloth') {
        setClothPreview(dataUrl)
        setClothDataUrl(dataUrl)
        setClothName(file.name)
      } else {
        setBackgroundDataUrl(dataUrl)
        setBackgroundName(file.name)
      }
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not read that photo.')
    } finally {
      setConverting(null)
    }
  }

  async function generate() {
    if (!clothDataUrl) {
      setError('Browse and select a cloth photo first.')
      return
    }
    if (backgroundMode === 'photo' && !backgroundDataUrl) {
      setError('Browse a background photo, or choose another background option.')
      return
    }
    if (backgroundMode === 'prompt' && !backgroundPrompt.trim()) {
      setError('Describe the background in the prompt box, or choose another option.')
      return
    }

    setStatus('loading')
    setError(null)
    setResultUrl(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clothDataUrl,
          backgroundMode,
          backgroundDataUrl: backgroundMode === 'photo' ? backgroundDataUrl : null,
          backgroundPrompt: backgroundMode === 'prompt' ? backgroundPrompt.trim() : null,
        }),
      })
      const payload = (await res.json()) as { imageDataUrl?: string; error?: string }
      if (!res.ok || !payload.imageDataUrl) {
        throw new Error(payload.error || 'Generation failed.')
      }
      setResultUrl(payload.imageDataUrl)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Generation failed.')
    }
  }

  const busy = status === 'loading' || converting !== null
  const backgroundReady =
    (backgroundMode === 'photo' && Boolean(backgroundDataUrl)) ||
    (backgroundMode === 'prompt' && Boolean(backgroundPrompt.trim()))
  const canGenerate = Boolean(clothDataUrl) && backgroundReady && !busy

  async function handleDownload() {
    if (!resultUrl) return
    try {
      await saveImageToDevice(resultUrl)
    } catch (err) {
      // User cancelled the share sheet — ignore.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save the photo. Long-press the image and choose Save Image.',
      )
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Cloth → model photoshoot</p>
        <h1 className="brand">Modellr</h1>
        <p className="tagline">
          Browse a garment, then choose a background photo or describe one with a prompt.
        </p>
      </header>

      <section className="workspace" aria-label="Generate model photo">
        <div className="controls">
          <div className="panel">
            <div className="panel-head">
              <h2>1. Cloth photo</h2>
              <p>Browse any format — JPG, PNG, WebP, HEIC, AVIF.</p>
            </div>

            <button
              type="button"
              className={`dropzone ${clothPreview ? 'has-file' : ''}`}
              onClick={() => clothInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void prepareImage(e.dataTransfer.files[0], 'cloth')
              }}
            >
              {clothPreview ? (
                <img src={clothPreview} alt="Uploaded cloth" className="cloth-preview" />
              ) : converting === 'cloth' ? (
                <span className="dropzone-copy">
                  <strong>Preparing photo…</strong>
                  <span>Converting if needed</span>
                </span>
              ) : (
                <span className="dropzone-copy">
                  <strong>Browse cloth photo</strong>
                  <span>Tap or drop a garment image</span>
                </span>
              )}
            </button>
            <input
              ref={clothInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={(e) => void prepareImage(e.target.files?.[0], 'cloth')}
            />
            {clothName && (
              <div className="file-meta">
                <span className="file-name" title={clothName}>
                  {clothName}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    setClothPreview(null)
                    setClothDataUrl(null)
                    setClothName(null)
                    setResultUrl(null)
                    setStatus('idle')
                    if (clothInputRef.current) clothInputRef.current.value = ''
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>2. Background</h2>
              <p>Choose how the photoshoot scene should be created.</p>
            </div>

            <div className="mode-row" role="radiogroup" aria-label="Background mode">
              <button
                type="button"
                role="radio"
                aria-checked={backgroundMode === 'photo'}
                className={`mode-btn ${backgroundMode === 'photo' ? 'active' : ''}`}
                onClick={() => selectMode('photo')}
              >
                With background photo
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={backgroundMode === 'prompt'}
                className={`mode-btn ${backgroundMode === 'prompt' ? 'active' : ''}`}
                onClick={() => selectMode('prompt')}
              >
                Random / prompt background
              </button>
            </div>

            {backgroundMode === 'photo' && (
              <>
                <button
                  type="button"
                  className={`browse-btn ${backgroundDataUrl ? 'selected' : ''}`}
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={converting === 'background'}
                >
                  {converting === 'background'
                    ? 'Preparing background…'
                    : backgroundName
                      ? 'Change background photo'
                      : 'Browse background from folder'}
                </button>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => void prepareImage(e.target.files?.[0], 'background')}
                />
                {backgroundName ? (
                  <div className="file-meta">
                    <span className="file-name" title={backgroundName}>
                      Selected: {backgroundName}
                    </span>
                    <button type="button" className="text-btn" onClick={clearBackgroundFile}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="helper">Background image is not previewed here — only the file name.</p>
                )}
              </>
            )}

            {backgroundMode === 'prompt' && (
              <>
                <label className="prompt-label" htmlFor="bg-prompt">
                  Describe the background
                </label>
                <textarea
                  id="bg-prompt"
                  className="prompt-input"
                  rows={3}
                  placeholder="e.g. sunny marble courtyard with soft daylight and greenery"
                  value={backgroundPrompt}
                  onChange={(e) => {
                    setBackgroundPrompt(e.target.value)
                    setResultUrl(null)
                    setStatus('idle')
                  }}
                />
                <p className="helper">OpenAI will invent a matching photoshoot scene from your text.</p>
              </>
            )}
          </div>

          <div className="panel actions-panel">
            <button type="button" className="generate-btn" disabled={!canGenerate} onClick={() => void generate()}>
              {status === 'loading' ? 'Generating…' : 'Generate model photo'}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="panel result-panel">
          <div className="panel-head">
            <h2>3. Model photo</h2>
            <p>OpenAI places your garment on a real model using the background option you chose.</p>
          </div>

          <div className={`result-frame ${resultUrl ? 'ready' : ''}`}>
            {status === 'loading' && (
              <p className="result-placeholder">Generating with OpenAI… this can take a moment.</p>
            )}
            {resultUrl && (
              <>
                <img src={resultUrl} alt="Generated model wearing the garment" />
                <p className="helper download-hint">
                  On phones: tap Save / Share, or long-press the image → Save Image.
                </p>
                <button type="button" className="download-btn" onClick={() => void handleDownload()}>
                  Save / share photo
                </button>
              </>
            )}
            {status !== 'loading' && !resultUrl && (
              <p className="result-placeholder">Result will show after you generate.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
