// Shared photo-capture helper — extracted from LabelPhotoButton.jsx so
// PhotoCaptureSheet.jsx (front + back package photos) can reuse the exact
// same downscale/encode step instead of duplicating it.

const MAX_DIM = 1024

/** Downscales an image file to fit MAX_DIM and returns base64 JPEG data (no `data:` prefix). */
export function downscaleToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the photo.'))
    }
    img.src = url
  })
}
