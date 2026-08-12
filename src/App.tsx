import { useEffect, useRef, useState } from 'react'
import { normalizeClothImage } from './lib/normalizeImage'
import './App.css'

type Background = {
  id: string
  file: string
  url: string
}

type Status = 'idle' | 'loading' | 'done' | 'error'

const MAX_BYTES = 20 * 1024 * 1024

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [clothPreview, setClothPreview] = useState<string | null>(null)
  const [clothDataUrl, setClothDataUrl] = useState<string | null>(null)
  const [backgroundId, setBackgroundId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/Background/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load backgrounds.')
        return res.json() as Promise<Background[]>
      })
      .then((items) => {
        if (cancelled) return
        setBackgrounds(items)
        if (items[0]) setBackgroundId(items[0].id)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load backgrounds.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onClothSelected(file: File | undefined) {
    if (!file) return
    setError(null)
    setResultUrl(null)
    setStatus('idle')

    if (file.size > MAX_BYTES) {
      setError('Photo is too large. Please use an image under 20 MB.')
      return
    }

    try {
      setConverting(true)
      const dataUrl = await normalizeClothImage(file)
      setClothPreview(dataUrl)
      setClothDataUrl(dataUrl)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not read that photo.')
    } finally {
      setConverting(false)
    }
  }

  async function generate() {
    if (!clothDataUrl || !backgroundId) {
      setError('Upload a cloth photo and choose a background first.')
      return
    }

    setStatus('loading')
    setError(null)
    setResultUrl(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clothDataUrl, backgroundId }),
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

  const canGenerate =
    Boolean(clothDataUrl && backgroundId) && status !== 'loading' && !converting

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Cloth → model photoshoot</p>
        <h1 className="brand">Modellr</h1>
        <p className="tagline">
          Upload a raw garment photo, pick a background, and generate a model wearing it.
        </p>
      </header>

      <section className="workspace" aria-label="Generate model photo">
        <div className="panel upload-panel">
          <div className="panel-head">
            <h2>1. Cloth photo</h2>
            <p>JPG, PNG, WebP, HEIC, AVIF, and similar — front-facing shots work best.</p>
          </div>

          <button
            type="button"
            className={`dropzone ${clothPreview ? 'has-file' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void onClothSelected(e.dataTransfer.files[0])
            }}
          >
            {clothPreview ? (
              <img src={clothPreview} alt="Uploaded cloth" className="cloth-preview" />
            ) : converting ? (
              <span className="dropzone-copy">
                <strong>Preparing photo…</strong>
                <span>Converting HEIC and other formats</span>
              </span>
            ) : (
              <span className="dropzone-copy">
                <strong>Drop cloth photo here</strong>
                <span>JPG, PNG, WebP, HEIC, AVIF…</span>
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif,.HEIC,.HEIF"
            className="sr-only"
            onChange={(e) => void onClothSelected(e.target.files?.[0])}
          />
          {clothPreview && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setClothPreview(null)
                setClothDataUrl(null)
                setResultUrl(null)
                setStatus('idle')
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              Remove photo
            </button>
          )}
        </div>

        <div className="panel bg-panel">
          <div className="panel-head">
            <h2>2. Background</h2>
            <p>Choose a photoshoot scene from your Background folder.</p>
          </div>
          <div className="bg-grid" role="listbox" aria-label="Background options">
            {backgrounds.map((bg) => (
              <button
                key={bg.id}
                type="button"
                role="option"
                aria-selected={backgroundId === bg.id}
                className={`bg-tile ${backgroundId === bg.id ? 'selected' : ''}`}
                onClick={() => setBackgroundId(bg.id)}
              >
                <img src={bg.url} alt={bg.id} />
                <span>{bg.id}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel result-panel">
          <div className="panel-head">
            <h2>3. Model photo</h2>
            <p>AI places your garment on a real model in the selected scene.</p>
          </div>

          <button type="button" className="generate-btn" disabled={!canGenerate} onClick={() => void generate()}>
            {status === 'loading' ? 'Generating…' : 'Generate model photo'}
          </button>

          {error && <p className="error" role="alert">{error}</p>}

          <div className={`result-frame ${resultUrl ? 'ready' : ''}`}>
            {status === 'loading' && <p className="result-placeholder">Creating your photoshoot…</p>}
            {resultUrl && (
              <>
                <img src={resultUrl} alt="Generated model wearing the garment" />
                <a className="download-btn" href={resultUrl} download="modellr-model-photo.png">
                  Download photo
                </a>
              </>
            )}
            {status !== 'loading' && !resultUrl && (
              <p className="result-placeholder">Your generated photo will appear here.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
