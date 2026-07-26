import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

// Grocery barcodes are EAN-13/EAN-8/UPC-A/UPC-E — narrowing the reader to
// just those (plus TRY_HARDER, zxing's slower-but-more-thorough decode pass)
// cuts down on misreads/false negatives versus the reader's full default
// format list, which also chases QR/Aztec/PDF417 etc. we never scan here.
const HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
  [DecodeHintType.TRY_HARDER, true],
])

export default function BarcodeScanner({ onCode, onCancel }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [cameraError, setCameraError] = useState(false)
  const [typedCode, setTypedCode] = useState('')
  // Keeps the latest onCode reachable from the decode callback without the
  // start-camera effect depending on it — onCode is a fresh closure every
  // parent render (DayLog/AddLogItemSheet re-render often while typing/
  // scanning), and restarting the camera on every one of those was both
  // wasteful and could drop mid-scan.
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader(HINTS)
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current,
          (result) => {
            if (result) onCodeRef.current(result.getText())
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      } catch {
        if (!cancelled) setCameraError(true)
      }
    }

    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      const stream = videoRef.current?.srcObject
      if (stream) stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function handleManualSubmit(e) {
    e.preventDefault()
    const code = typedCode.trim()
    if (code) onCode(code)
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Scan barcode</h2>

        {!cameraError ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} className="barcode-scanner__video" muted playsInline />
        ) : (
          <p className="placeholder">Camera unavailable — enter the barcode manually.</p>
        )}

        <form className="field" onSubmit={handleManualSubmit}>
          <label htmlFor="barcode-manual">Type barcode</label>
          <input
            id="barcode-manual"
            type="text"
            inputMode="numeric"
            value={typedCode}
            onChange={(e) => setTypedCode(e.target.value)}
            autoFocus={cameraError}
          />
          <div className="button-row">
            <button type="submit" className="btn btn--primary" disabled={!typedCode.trim()}>
              Use this code
            </button>
          </div>
        </form>

        <div className="button-row">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
