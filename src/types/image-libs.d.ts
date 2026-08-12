declare module 'heic2any' {
  type Heic2AnyOptions = {
    blob: Blob
    toType?: string
    quality?: number
  }

  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>
}

declare module 'heic-to' {
  export function isHeic(file: File | Blob): Promise<boolean>
  export function heicTo(options: {
    blob: Blob
    type: 'image/jpeg' | 'image/png' | 'image/bitmap'
    quality?: number
  }): Promise<Blob | ImageBitmap>
}
