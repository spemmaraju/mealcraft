import { useState } from 'react'
import { COMPONENT_TYPES, STATIONS, ORIGINS } from '../schema.js'
import IngredientListEditor from './IngredientListEditor.jsx'
import StepListEditor from './StepListEditor.jsx'

function toIntOrZero(text) {
  const n = parseInt(text, 10)
  return Number.isNaN(n) ? 0 : n
}

export default function ComponentEditor({ component, isNew, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(component.name)
  const [type, setType] = useState(component.type)
  const [cuisineTagsText, setCuisineTagsText] = useState(component.cuisineTags.join(', '))
  const [ingredients, setIngredients] = useState(component.ingredients)
  const [steps, setSteps] = useState(component.steps)
  const [shelfLifeDays, setShelfLifeDays] = useState(String(component.shelfLifeDays))
  const [activeMin, setActiveMin] = useState(String(component.activeMin))
  const [passiveMin, setPassiveMin] = useState(String(component.passiveMin))
  const [storageText, setStorageText] = useState(component.storage)
  const [station, setStation] = useState(component.station)
  const [hasMacros, setHasMacros] = useState(component.macrosPerServing !== null)
  const [kcal, setKcal] = useState(String(component.macrosPerServing?.kcal ?? 0))
  const [protein, setProtein] = useState(String(component.macrosPerServing?.protein_g ?? 0))
  const [carbs, setCarbs] = useState(String(component.macrosPerServing?.carbs_g ?? 0))
  const [fat, setFat] = useState(String(component.macrosPerServing?.fat_g ?? 0))
  const [macroSource, setMacroSource] = useState(
    component.macroSource === 'ai_estimate' ? 'ai_estimate' : 'manual',
  )
  const [origin, setOrigin] = useState(component.origin)
  const [archived, setArchived] = useState(component.archived)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave(component.id, {
      name: trimmedName,
      type,
      cuisineTags: cuisineTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ingredients: ingredients.filter((row) => row.name.trim()),
      steps: steps.filter((s) => s.trim()),
      shelfLifeDays: toIntOrZero(shelfLifeDays),
      storage: storageText,
      station,
      activeMin: toIntOrZero(activeMin),
      passiveMin: toIntOrZero(passiveMin),
      macrosPerServing: hasMacros
        ? {
            kcal: toIntOrZero(kcal),
            protein_g: toIntOrZero(protein),
            carbs_g: toIntOrZero(carbs),
            fat_g: toIntOrZero(fat),
          }
        : null,
      macroSource: hasMacros ? macroSource : 'manual',
      origin,
      archived,
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'New component' : 'Edit component'}</h2>

        <div className="field">
          <label htmlFor="component-name">Name</label>
          <input id="component-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="component-type">Type</label>
          <select id="component-type" value={type} onChange={(e) => setType(e.target.value)}>
            {COMPONENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="component-tags">Cuisine tags</label>
          <input
            id="component-tags"
            type="text"
            value={cuisineTagsText}
            onChange={(e) => setCuisineTagsText(e.target.value)}
            placeholder="comma-separated, e.g. indian, weeknight"
          />
        </div>

        <IngredientListEditor ingredients={ingredients} onChange={setIngredients} />
        <StepListEditor steps={steps} onChange={setSteps} />

        <div className="field">
          <span>Time &amp; shelf life</span>
          <div className="button-row">
            <input
              type="text"
              inputMode="numeric"
              value={shelfLifeDays}
              onChange={(e) => setShelfLifeDays(e.target.value)}
              placeholder="Shelf life (days)"
            />
            <input
              type="text"
              inputMode="numeric"
              value={activeMin}
              onChange={(e) => setActiveMin(e.target.value)}
              placeholder="Active min"
            />
            <input
              type="text"
              inputMode="numeric"
              value={passiveMin}
              onChange={(e) => setPassiveMin(e.target.value)}
              placeholder="Passive min"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="component-storage">Storage</label>
          <input
            id="component-storage"
            type="text"
            value={storageText}
            onChange={(e) => setStorageText(e.target.value)}
            placeholder="e.g. fridge airtight, 4 days"
          />
        </div>

        <div className="field">
          <label htmlFor="component-station">Station</label>
          <select id="component-station" value={station} onChange={(e) => setStation(e.target.value)}>
            {STATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="checkbox-field">
            <input type="checkbox" checked={hasMacros} onChange={(e) => setHasMacros(e.target.checked)} />
            Macros per serving
          </label>
          {hasMacros && (
            <>
              <div className="button-row">
                <input
                  type="text"
                  inputMode="numeric"
                  value={kcal}
                  onChange={(e) => setKcal(e.target.value)}
                  placeholder="kcal"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="protein g"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  placeholder="carbs g"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  placeholder="fat g"
                />
              </div>
              <select value={macroSource} onChange={(e) => setMacroSource(e.target.value)}>
                <option value="manual">manual</option>
                <option value="ai_estimate">ai_estimate</option>
              </select>
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="component-origin">Origin</label>
          <select id="component-origin" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="checkbox-field">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived
          </label>
        </div>

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {!isNew && (
          <div className="button-row sheet__danger-row">
            {!confirmingDelete ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            ) : (
              <>
                <span className="sheet__confirm-text">Really delete?</span>
                <button type="button" className="btn btn--danger" onClick={() => onDelete(component.id)}>
                  Really delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
