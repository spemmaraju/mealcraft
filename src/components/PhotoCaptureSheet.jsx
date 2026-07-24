import { useEffect, useRef, useState } from 'react'
import { downscaleToBase64 } from '../imageCapture.js'
import { lookupFoodPhotos } from '../nutritionLookup.js'
import { CameraIcon } from './Icons.jsx'

// A captured photo slot: { file, url } (url is an object URL for the
// thumbnail — revoked on replace/unmount) or null. `photoRef` mirrors the
// state so unmount cleanup can revoke the latest URL without setting state
// after unmount.
function usePhotoSlot() {
  const [photo, setPhoto] = useState(null)
  const photoRef = useRef(null)

  function capture(file) {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    const next = { file, url: URL.createObjectURL(file) }
    photoRef.current = next
    setPhoto(next)
  }

  function clear() {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    photoRef.current = null
    setPhoto(null)
  }

  useEffect(() => () => photoRef.current && URL.revokeObjectURL(photoRef.current.url), [])

  return [photo, capture, clear]
}

// One capture row: hidden file input (camera-first via capture="environment")
// behind a styled button, showing a thumbnail + Retake once a photo exists.
function CaptureRow({ title, caption, photo, onCapture, onRetake, disabled }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (file) onCapture(file)
  }

  return (
    <div className="photo-capture-row">
      <div className="photo-capture-row__thumb">
        {photo ? <img src={photo.url} alt="" /> : <CameraIcon size={22} />}
      </div>
      <div className="photo-capture-row__body">
        <span className="photo-capture-row__title">{title}</span>
        {caption && <span className="photo-capture-row__caption">{caption}</span>}
        <button type="button" className="btn" disabled={disabled} onClick={() => (photo ? onRetake() : inputRef.current?.click())}>
          {photo ? 'Retake' : 'Take photo'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}

// Photo-capture flow for logging a packaged food from its box: nutrition
// label (required) + front of package (optional, just for the name) in ONE
// BYOK request. Renders as a stacked overlay, same convention as
// BarcodeScanner/AddItemAmountStep layering over the already-open add sheet.
// `onUse({name, nutrition})` hands the extracted result back to the caller —
// this component never touches pantry/log storage itself.
export default function PhotoCaptureSheet({ byok, onUse, onCancel }) {
  const [labelPhoto, captureLabel, clearLabel] = usePhotoSlot()
  const [frontPhoto, captureFront, clearFront] = usePhotoSlot()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { name, nutrition } | null — non-null means "show result step"
  const [name, setName] = useState('')

  async function handleReadPhotos() {
    if (!labelPhoto) return
    setBusy(true)
    setError(null)
    try {
      const images = [{ mediaType: 'image/jpeg', data: await downscaleToBase64(labelPhoto.file) }]
      if (frontPhoto) images.push({ mediaType: 'image/jpeg', data: await downscaleToBase64(frontPhoto.file) })
      const res = await lookupFoodPhotos({ provider: byok.provider, apiKey: byok.apiKey, images })
      if (!res.ok) {
        setError("Couldn't read the label — try a clearer, well-lit photo.")
        return
      }
      setResult({ name: res.name, nutrition: res.nutrition })
      setName(res.name || '')
    } catch {
      setError("Couldn't read the label — try a clearer, well-lit photo.")
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const { perServing, servingDesc } = result.nutrition
    return (
      <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h2>Confirm food</h2>
          <div className="field">
            <label htmlFor="photo-food-name">Name</label>
            <input
              id="photo-food-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this food"
              autoFocus
            />
          </div>
          <p className="nutrition-summary">
            {Math.round(perServing.kcal)} kcal — {perServing.protein_g}g protein, {perServing.carbs_g}g carbs, {perServing.fat_g}g fat
            {servingDesc ? ` · ${servingDesc}` : ''}
          </p>
          <div className="button-row">
            <button type="button" className="btn btn--primary" disabled={!name.trim()} onClick={() => onUse({ name: name.trim(), nutrition: result.nutrition })}>
              Use this
            </button>
            <button type="button" className="btn" onClick={() => setResult(null)}>
              Retake
            </button>
          </div>
          <div className="button-row">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Take photo</h2>

        <CaptureRow title="Nutrition label" caption="required" photo={labelPhoto} onCapture={captureLabel} onRetake={clearLabel} disabled={busy} />
        <CaptureRow title="Front of package" caption="optional — for the name" photo={frontPhoto} onCapture={captureFront} onRetake={clearFront} disabled={busy} />

        {error && <p className="inline-warning">{error}</p>}

        <div className="button-row">
          <button type="button" className="btn btn--primary" disabled={!labelPhoto || busy} onClick={handleReadPhotos}>
            {busy ? 'Reading photos…' : 'Read photos'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
