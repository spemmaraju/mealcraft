import { useState } from 'react'
import * as storage from '../storage.js'
import { computeTargets } from '../todayOps.js'
import { CloseIcon } from './Icons.jsx'

const SEXES = [['male', 'Male'], ['female', 'Female'], [null, 'Prefer not to say']]
const ACTIVITIES = [['low', 'Mostly sitting'], ['moderate', 'Some movement'], ['high', 'Very active']]
const GOALS = [['lose', 'Lose fat slowly'], ['maintain', 'Stay the same']]
const CM_PER_IN = 2.54
const KG_PER_LB = 0.45359237

const num = (t) => {
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : null
}
const r1 = (n) => String(Math.round(n * 10) / 10)

function Choice({ label, options, value, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="button-row">
        {options.map(([v, text]) => (
          <button key={text} type="button" className={`btn${value === v ? ' btn--primary' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumberRow({ label, ids, values, onChange, unit }) {
  return (
    <div className="field">
      <span>
        {label} {unit}
      </span>
      <div className="button-row">
        {ids.map((id, i) => (
          <input key={id} type="text" inputMode="decimal" aria-label={`${label} ${ids.length > 1 ? (i === 0 ? 'low' : 'high') : ''}`.trim()} value={values[i]} onChange={(e) => onChange(id, e.target.value)} />
        ))}
      </div>
    </div>
  )
}

// "Set your daily targets": body details -> rough kcal / protein / fibre
// targets (todayOps.computeTargets), each editable before saving. Saves
// settings.profile (metric), kcalBand, proteinBand, fiberTarget_g in one write.
export default function TargetsSheet({ settings, onClose }) {
  const p = settings?.profile
  const [sex, setSex] = useState(p ? p.sex : null)
  const [age, setAge] = useState(p ? String(p.age) : '')
  const [height, setHeight] = useState(p ? String(Math.round(p.heightCm)) : '')
  const [heightUnit, setHeightUnit] = useState('cm')
  const [weight, setWeight] = useState(p ? r1(p.weightKg) : '')
  const [weightUnit, setWeightUnit] = useState('kg')
  const [activity, setActivity] = useState(p ? p.activity : 'moderate')
  const [goal, setGoal] = useState(p ? p.goal : 'lose')
  const [edits, setEdits] = useState({})
  const [seeded, setSeeded] = useState(false)

  const heightCm = num(height) && num(height) * (heightUnit === 'in' ? CM_PER_IN : 1)
  const weightKg = num(weight) && num(weight) * (weightUnit === 'lb' ? KG_PER_LB : 1)
  const valid = !!(num(age) && heightCm && weightKg)
  const profile = valid ? { sex, age: num(age), heightCm, weightKg, activity, goal } : null
  const computed = profile ? computeTargets(profile) : null
  const auto = computed && {
    kcalLow: computed.kcalBand.low,
    kcalHigh: computed.kcalBand.high,
    pLow: computed.proteinBand.low_g,
    pHigh: computed.proteinBand.high_g,
    fiber: computed.fiberTarget_g,
  }

  // Existing targets that differ from what the profile computes are the user's own edits — keep them.
  if (!seeded && auto && settings?.kcalBand) {
    const existing = {
      kcalLow: settings.kcalBand.low,
      kcalHigh: settings.kcalBand.high,
      pLow: settings.proteinBand.low_g,
      pHigh: settings.proteinBand.high_g,
      fiber: settings.fiberTarget_g,
    }
    setSeeded(true)
    setEdits(Object.fromEntries(Object.entries(existing).filter(([k, v]) => v != null && v !== auto[k]).map(([k, v]) => [k, String(v)])))
  }
  const shown = (k) => (edits[k] ?? (auto ? String(auto[k]) : ''))
  const setEdit = (k, v) => setEdits((e) => ({ ...e, [k]: v }))
  const parsed = auto && Object.fromEntries(Object.keys(auto).map((k) => [k, num(shown(k))]))
  const canSave = !!parsed && Object.values(parsed).every((v) => v != null) && parsed.kcalLow <= parsed.kcalHigh && parsed.pLow <= parsed.pHigh

  async function handleSave() {
    const fresh = await storage.get('settings')
    await storage.set('settings', {
      ...fresh,
      profile,
      kcalBand: { low: parsed.kcalLow, high: parsed.kcalHigh },
      proteinBand: { low_g: parsed.pLow, high_g: parsed.pHigh },
      fiberTarget_g: parsed.fiber,
    })
    onClose()
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
          <h2 className="sheet-head__title">Your daily targets</h2>
        </div>

        <Choice label="Sex" options={SEXES} value={sex} onChange={setSex} />
        <div className="field">
          <label htmlFor="tg-age">Age</label>
          <input id="tg-age" type="text" inputMode="decimal" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tg-height">Height</label>
          <div className="button-row">
            <input id="tg-height" type="text" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
            <select aria-label="Height unit" value={heightUnit} onChange={(e) => setHeightUnit(e.target.value)}>
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tg-weight">Weight</label>
          <div className="button-row">
            <input id="tg-weight" type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <select aria-label="Weight unit" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
        </div>
        <Choice label="Activity" options={ACTIVITIES} value={activity} onChange={setActivity} />
        <Choice label="Goal" options={GOALS} value={goal} onChange={setGoal} />

        {auto ? (
          <>
            <NumberRow label="Calories" unit="(kcal)" ids={['kcalLow', 'kcalHigh']} values={[shown('kcalLow'), shown('kcalHigh')]} onChange={setEdit} />
            <NumberRow label="Protein" unit="(g)" ids={['pLow', 'pHigh']} values={[shown('pLow'), shown('pHigh')]} onChange={setEdit} />
            <NumberRow label="Fibre" unit="(g)" ids={['fiber']} values={[shown('fiber')]} onChange={setEdit} />
          </>
        ) : (
          <p className="field-caption">Fill in age, height and weight to see your targets.</p>
        )}
        <p className="field-caption">Rough, directional targets — not medical advice. Edit any time under Me.</p>

        <div className="button-row">
          <button type="button" className="btn btn--primary" disabled={!canSave} onClick={handleSave}>
            Save targets
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
