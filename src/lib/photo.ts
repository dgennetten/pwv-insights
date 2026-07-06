// Compress a captured image File into a JPEG data URL, downscaling so the
// longest edge is at most `maxDim`px. Keeps offline storage and the eventual
// upload small, and normalizes orientation from EXIF where supported.

export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.7,
): Promise<string> {
  let source: ImageBitmap | HTMLImageElement
  let objectUrl: string | null = null

  if ('createImageBitmap' in window) {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } else {
    objectUrl = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve()
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = objectUrl!
    })
    source = img
  }

  try {
    const srcW = source.width
    const srcH = source.height
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported')
    ctx.drawImage(source, 0, 0, w, h)

    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    if ('close' in source && typeof source.close === 'function') source.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
