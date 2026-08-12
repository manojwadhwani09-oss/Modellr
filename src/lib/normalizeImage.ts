import { heicTo, isHeic } from 'heic-to'

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

/** Keep HEIC selectable in OS file pickers (image/* often hides them). */
export const FILE_ACCEPT =
  '.heic,.heif,.HEIC,.HEIF,.jpg,.jpeg,.JPG,.JPEG,.png,.PNG,.webp,.WEBP,.gif,.bmp,.avif,image/heic,image/heif,image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp'

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.at(-1)! : ''
}

export function isLikelyImageFile(file: File): boolean {
  const ext = extensionOf(file.name)
  const type = (file.type || '').toLowerCase()

  if (type.startsWith('image/')) return true
  if (ALLOWED_EXT.has(ext)) return true
  // macOS/iOS often report HEIC as empty or octet-stream
  if ((type === '' || type === 'application/octet-stream') && ext) return ALLOWED_EXT.has(ext)
  return false
}

function looksLikeHeicByNameOrType(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  const ext = extensionOf(file.name)
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    ext === 'heic' ||
    ext === 'heif'
  )
}

async function looksLikeHeicByMagic(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 24).arrayBuffer())
  if (header.length < 12) return false
  // ISO BMFF: bytes 4..7 = 'ftyp', brand follows
  const ftyp =
    header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70
  if (!ftyp) return false
  const brand = String.fromCharCode(header[8], header[9], header[10], header[11]).toLowerCase()
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'miaf'].includes(
    brand,
  )
}

async function shouldConvertHeic(file: File): Promise<boolean> {
  if (looksLikeHeicByNameOrType(file)) return true
  try {
    if (await isHeic(file)) return true
  } catch {
    // ignore detector failures
  }
  try {
    return await looksLikeHeicByMagic(file)
  } catch {
    return false
  }
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
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function convertHeicToJpegBlob(file: File): Promise<Blob> {
  const errors: string[] = []

  // 1) Native decode (Safari / some WebKit builds)
  try {
    const dataUrl = await canvasToJpegDataUrl(file)
    const res = await fetch(dataUrl)
    return await res.blob()
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'native decode failed')
  }

  // 2) heic-to (libheif)
  try {
    const result = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    })
    if (result instanceof Blob) return result
    throw new Error('heic-to returned an unexpected result')
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'heic-to failed')
  }

  // 3) Legacy heic2any fallback
  try {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })
    const blob = Array.isArray(converted) ? converted[0] : converted
    if (blob) return blob
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'heic2any failed')
  }

  throw new Error(
    `Could not convert HEIC/HEIF (${errors.join('; ')}). Try another browser or export as JPG.`,
  )
}

/**
 * Accept camera/phone formats (including .HEIC) and return a JPEG data URL.
 */
export async function normalizeClothImage(file: File): Promise<string> {
  if (!isLikelyImageFile(file)) {
    throw new Error('Please upload an image (JPG, PNG, WebP, HEIC, AVIF, and similar).')
  }

  let working: Blob = file

  if (await shouldConvertHeic(file)) {
    working = await convertHeicToJpegBlob(file)
  }

  try {
    return await canvasToJpegDataUrl(working)
  } catch {
    return blobToDataUrl(working)
  }
}
