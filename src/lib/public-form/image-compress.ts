/** Kompres foto di peramban: sisi terpanjang ≤ 1280 px, WebP (JPEG bila WebP tak didukung), ≤ 900 KB. */
export const MAX_SIDE = 1280
export const MAX_BYTES = 900 * 1024
export const MAX_INPUT_BYTES = 30 * 1024 * 1024
export const MAX_PHOTOS = 3

export class PhotoError extends Error {}

/** Skala ke dalam kotak max×max; tidak pernah memperbesar. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const k = max / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function decode(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* jatuh ke <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new PhotoError('Foto tidak bisa dibaca.'))
      img.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/'))
    throw new PhotoError('Pilih file gambar (JPG, PNG, atau WebP).')
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('Foto terlalu besar (maksimal 30 MB).')
  const img = await decode(file)
  try {
    let scale = 1
    for (let shrink = 0; shrink < 4; shrink++) {
      const base = fitWithin(img.width, img.height)
      const width = Math.max(1, Math.round(base.width * scale))
      const height = Math.max(1, Math.round(base.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new PhotoError('Peramban tidak mendukung pemrosesan foto.')
      ctx.drawImage(img.source, 0, 0, width, height)
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        let blob = await toBlob(canvas, 'image/webp', q)
        // Safari lama membuat PNG saat WebP tak didukung → pakai JPEG (bucket menerima webp & jpeg).
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q)
        if (blob && blob.size <= MAX_BYTES) return blob
      }
      scale *= 0.75
    }
    throw new PhotoError('Foto terlalu besar setelah dikompres. Coba foto lain.')
  } finally {
    img.close()
  }
}
