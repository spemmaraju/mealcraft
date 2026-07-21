import { useState } from 'react'
import { createNutritionInfo } from '../schema.js'
import { findSeedForName } from '../nutritionOps.js'
import { lookupBarcode } from '../nutritionLookup.js'
import NaturalUnitsEditor from './NaturalUnitsEditor.jsx'
import BarcodeScanner from './BarcodeScanner.jsx'
import LabelPhotoButton from './LabelPhotoButton.jsx'

function toNumOrZero(text) {
  const n = parseFloat(text)
  return Number.isNaN(n) ? 0 : n
}

// Second-layer sheet over PantryItemEditor. Scan/seed results prefill the
// form for confirmation — nothing is saved until the user taps Save (this is
// the seam Phase 6's label-photo capture will plug into).
export default function NutritionInfoEditor({ itemName, nutrition, fdcKey, byok, onSave, onCancel }) {
  const base = nutrition ?? createNutritionInfo()
  const [source, setSource] = useState(base.source)
  const [servingDesc, setServingDesc] = useState(base.servingDesc)
  const [servingsPerContainer, setServingsPerContainer] = useState(
    base.servingsPerContainer != null ? String(base.servingsPerContainer) : '',
  )
  const [kcal, setKcal] = useState(String(base.perServing.kcal))
  const [protein, setProtein] = useState(String(base.perServing.protein_g))
  const [carbs, setCarbs] = useState(String(base.perServing.carbs_g))
  const [fat, setFat] = useState(String(base.perServing.fat_g))
  const [hasFiber, setHasFiber] = useState(base.perServing.fiber_g != null)
  const [fiber, setFiber] = useState(String(base.perServing.fiber_g ?? 0))
  const [naturalUnits, setNaturalUnits] = useState(base.naturalUnits)
  const [barcode, setBarcode] = useState(base.barcode ?? null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lookupMsg, setLookupMsg] = useState(null)

  function applyPrefill(fresh) {
    setSource(fresh.source)
    setServingDesc(fresh.servingDesc)
    setServingsPerContainer(fresh.servingsPerContainer != null ? String(fresh.servingsPerContainer) : '')
    setKcal(String(fresh.perServing.kcal))
    setProtein(String(fresh.perServing.protein_g))
    setCarbs(String(fresh.perServing.carbs_g))
    setFat(String(fresh.perServing.fat_g))
    setHasFiber(fresh.perServing.fiber_g != null)
    setFiber(String(fresh.perServing.fiber_g ?? 0))
    setNaturalUnits(fresh.naturalUnits)
    setBarcode(fresh.barcode ?? null)
  }

  // Typing a macro value by hand overrides whatever provenance the fields
  // currently carry (even if they were just autofilled/scanned).
  function handleMacroInput(setter) {
    return (e) => {
      setSource('manual')
      setter(e.target.value)
    }
  }

  function handleFillFromSeed() {
    const seeded = findSeedForName(itemName)
    if (!seeded) {
      setLookupMsg({ type: 'error', text: `No seed table entry matches "${itemName}".` })
      return
    }
    applyPrefill(seeded)
    setLookupMsg({ type: 'success', text: 'Filled from the seed table — review and Save.' })
  }

  async function handleScanned(code) {
    setScanning(false)
    setLookupMsg({ type: 'success', text: 'Looking up barcode…' })
    const result = await lookupBarcode(code, { fdcKey })
    if (result.ok) {
      applyPrefill(result.nutrition)
      setLookupMsg({ type: 'success', text: 'Found online — review and Save.' })
    } else {
      setBarcode(code)
      setLookupMsg({ type: 'error', text: 'Not found online — enter nutrition manually below.' })
    }
  }

  function handleLabelPhotoResult(result) {
    if (result.ok) {
      applyPrefill(result.nutrition)
      setLookupMsg({ type: 'success', text: 'Read from photo — review and Save.' })
    } else {
      setLookupMsg({ type: 'error', text: "Couldn't read the label — enter nutrition manually." })
    }
  }

  function handleSave() {
    onSave({
      source,
      servingDesc,
      servingsPerContainer: servingsPerContainer.trim() ? toNumOrZero(servingsPerContainer) : null,
      perServing: {
        kcal: toNumOrZero(kcal),
        protein_g: toNumOrZero(protein),
        carbs_g: toNumOrZero(carbs),
        fat_g: toNumOrZero(fat),
        ...(hasFiber ? { fiber_g: toNumOrZero(fiber) } : {}),
      },
      naturalUnits,
      barcode,
    })
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Nutrition — {itemName}</h2>

        <div className="button-row">
          <button type="button" className="btn" onClick={() => setScanning(true)}>
            Scan barcode
          </button>
          <button type="button" className="btn" onClick={handleFillFromSeed}>
            Autofill from common foods
          </button>
          {byok && <LabelPhotoButton byok={byok} onResult={handleLabelPhotoResult} />}
        </div>
        {lookupMsg && <div className={`message message--${lookupMsg.type}`}>{lookupMsg.text}</div>}

        <div className="field">
          <label htmlFor="nutrition-serving-desc">Serving size</label>
          <input
            id="nutrition-serving-desc"
            type="text"
            value={servingDesc}
            onChange={(e) => setServingDesc(e.target.value)}
            placeholder='e.g. "1/3 cup drained (55 g)"'
          />
        </div>

        <div className="field">
          <label htmlFor="nutrition-servings-per-container">Servings per container (optional)</label>
          <input
            id="nutrition-servings-per-container"
            type="text"
            inputMode="decimal"
            value={servingsPerContainer}
            onChange={(e) => setServingsPerContainer(e.target.value)}
            placeholder="skip if unknown"
          />
        </div>

        <div className="field">
          <span>Per serving</span>
          <div className="button-row">
            <div className="field">
              <label htmlFor="nutrition-kcal">Calories</label>
              <input id="nutrition-kcal" type="text" inputMode="decimal" value={kcal} onChange={handleMacroInput(setKcal)} />
            </div>
            <div className="field">
              <label htmlFor="nutrition-protein">Protein (g)</label>
              <input id="nutrition-protein" type="text" inputMode="decimal" value={protein} onChange={handleMacroInput(setProtein)} />
            </div>
            <div className="field">
              <label htmlFor="nutrition-carbs">Carbs (g)</label>
              <input id="nutrition-carbs" type="text" inputMode="decimal" value={carbs} onChange={handleMacroInput(setCarbs)} />
            </div>
            <div className="field">
              <label htmlFor="nutrition-fat">Fat (g)</label>
              <input id="nutrition-fat" type="text" inputMode="decimal" value={fat} onChange={handleMacroInput(setFat)} />
            </div>
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={hasFiber} onChange={(e) => setHasFiber(e.target.checked)} />
            Fiber
          </label>
          {hasFiber && (
            <input
              type="text"
              inputMode="decimal"
              value={fiber}
              onChange={(e) => setFiber(e.target.value)}
              placeholder="fiber g"
            />
          )}
        </div>

        <NaturalUnitsEditor units={naturalUnits} onChange={setNaturalUnits} />

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Save
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {nutrition && (
          <div className="button-row sheet__danger-row">
            {!confirmingRemove ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirmingRemove(true)}>
                Remove nutrition
              </button>
            ) : (
              <>
                <span className="sheet__confirm-text">Really remove?</span>
                <button type="button" className="btn btn--danger" onClick={() => onSave(null)}>
                  Really remove
                </button>
                <button type="button" className="btn" onClick={() => setConfirmingRemove(false)}>
                  Keep it
                </button>
              </>
            )}
          </div>
        )}

        {scanning && <BarcodeScanner onCode={handleScanned} onCancel={() => setScanning(false)} />}
      </div>
    </div>
  )
}
