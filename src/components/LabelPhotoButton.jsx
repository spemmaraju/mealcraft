import { useRef, useState } from 'react'
import { lookupLabelPhoto } from '../nutritionLookup.js'
import { downscaleToBase64 } from '../imageCapture.js'

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
