import heic2any from 'heic2any'

const ALLOWED_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
])

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.at(-1)! : ''
}

export function isLikelyImageFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (file.type.startsWith('image/')) return true
  // iOS/macOS often leave HEIC mime empty in Chrome
  if (!file.type && ALLOWED_EXT.has(ext)) return true
  if (file.type === 'application/octet-stream' && ALLOWED_EXT.has(ext)) return true
  return ALLOWED_EXT.has(ext)
}

function isHeicLike(file: File): boolean {
  const type = file.type.toLowerCase()
  const ext = extensionOf(file.name)
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence' ||
    ext === 'heic' ||
    ext === 'heif'
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that photo.'))
    reader.readAsDataURL(blob)
  })
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode that image format in this browser.'))
    img.src = url
  })
}

/** Re-encode any browser-decodable image to JPEG for preview + Gemini. */
async function canvasToJpegDataUrl(source: Blob | File, quality = 0.92): Promise<string> {
  const objectUrl = URL.createObjectURL(source)
  try {
    const img = await loadImageFromUrl(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    if (!canvas.width || !canvas.height) {
      throw new Error('Image has invalid dimensions.')
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image.')
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Accept common camera/phone formats (including HEIC) and return a JPEG data URL.
 */
export async function normalizeClothImage(file: File): Promise<string> {
  if (!isLikelyImageFile(file)) {
    throw new Error('Please upload an image (JPG, PNG, WebP, HEIC, AVIF, and similar).')
  }

  let working: Blob = file

  if (isHeicLike(file)) {
    try {
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      working = Array.isArray(converted) ? converted[0]! : converted
    } catch {
      throw new Error('Could not convert HEIC/HEIF. Try exporting as JPG, or use Safari.')
    }
  }

  // Prefer canvas re-encode so preview + API always get JPEG
  try {
    return await canvasToJpegDataUrl(working)
  } catch {
    // Fallback: raw data URL (Gemini accepts jpeg/png/webp/heic)
    return blobToDataUrl(working)
  }
}
