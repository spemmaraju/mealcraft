import { useRef, useState } from 'react'
import { lookupLabelPhoto } from '../nutritionLookup.js'

const MAX_DIM = 1024

function downscaleToBase64(file) {
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

// Behind a styled button so we control layout — the native file input is
// hidden and triggered via ref. `byok` is { provider, apiKey }.
export default function LabelPhotoButton({ byok, onResult }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setBusy(true)
    try {
      const data = await downscaleToBase64(file)
      const result = await lookupLabelPhoto({ provider: byok.provider, apiKey: byok.apiKey, mediaType: 'image/jpeg', data })
      onResult(result)
    } catch {
      onResult({ ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Reading photo…' : 'Photo of label'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
    </>
  )
}
