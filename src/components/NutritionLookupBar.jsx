import LabelPhotoButton from './LabelPhotoButton.jsx'

// Extracted from NutritionInfoEditor purely to keep that file under the
// ~300-line house style limit (CLAUDE.md §4.7) — no lookup logic lives
// here, just the entry-point buttons, the lookup status message, and the
// found-name proposal line. All state (scanning/searchingOnline/foundName/
// acceptedName) stays owned by NutritionInfoEditor; this just renders it.
export default function NutritionLookupBar({
  onScan,
  onSearchOnline,
  onFillFromSeed,
  byok,
  onLabelPhotoResult,
  lookupMsg,
  askName,
  itemName,
  foundName,
  acceptedName,
  onAcceptFoundName,
}) {
  return (
    <>
      <div className="button-row">
        <button type="button" className="btn" onClick={onScan}>
          Scan barcode
        </button>
        <button type="button" className="btn" onClick={onSearchOnline}>
          Search online
        </button>
        <button type="button" className="btn" onClick={onFillFromSeed}>
          Autofill from common foods
        </button>
        {byok && <LabelPhotoButton byok={byok} onResult={onLabelPhotoResult} />}
      </div>
      {lookupMsg && <div className={`message message--${lookupMsg.type}`}>{lookupMsg.text}</div>}
      {!askName && foundName && !acceptedName && foundName.trim().toLowerCase() !== itemName.trim().toLowerCase() && (
        <p className="field-caption">
          Found "{foundName}" —{' '}
          <button type="button" className="link-btn" onClick={onAcceptFoundName}>
            Use as item name
          </button>
        </p>
      )}
    </>
  )
}
