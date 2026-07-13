import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

export default function BarcodeScanner({ onCode, onCancel }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [cameraError, setCameraError] = useState(false)
  const [typedCode, setTypedCode] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) onCode(result.getText())
        })
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
  }, [onCode])

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
