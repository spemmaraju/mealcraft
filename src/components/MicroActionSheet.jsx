import { useState } from 'react'
import { compileComponentPrompt } from '../promptCompiler.js'
import { regenerateComponentViaApi } from '../byok.js'

const DEFAULT_INSTRUCTION = {
  regenerate: 'Make it a bit more interesting — same general idea, one small twist.',
  substitute: 'Suggest a different component for this slot — different cuisine or flavor profile.',
}

const BUSY_ASKING = 'Asking Claude… this can take a minute'
const BUSY_RETRYING = 'Reply had validation issues — asking for a fix…'

// Same backdrop pattern as NutritionInfoEditor. Nothing persists until Apply —
// the caller owns upserting the previewed component.
export default function MicroActionSheet({ mode, component, pantry, settings, onApply, onCancel }) {
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION[mode])
  const [generating, setGenerating] = useState(false)
  const [busyMsg, setBusyMsg] = useState(BUSY_ASKING)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setGenerating(true)
    setBusyMsg(BUSY_ASKING)
    setError(null)
    setPreview(null)
    const prompt = compileComponentPrompt({ component, pantry, settings }, { mode, instruction })
    const result = await regenerateComponentViaApi({
      provider: settings.provider,
      apiKey: settings.apiKey,
      prompt,
      onProgress: (stage) => {
        if (stage === 'retrying') setBusyMsg(BUSY_RETRYING)
      },
    })
    setGenerating(false)
    if (result.ok) {
      setPreview(result.component)
    } else {
      setError(result.errors.join('; '))
    }
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'substitute' ? 'AI substitute' : 'Regenerate (AI)'}</h2>
        <p className="placeholder">Nothing is saved until you tap Apply.</p>

        <div className="field">
          <label htmlFor="micro-action-instruction">Instruction</label>
          <textarea
            id="micro-action-instruction"
            rows={3}
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value)
              setPreview(null)
              setError(null)
            }}
          />
        </div>

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleGenerate} disabled={generating || !instruction.trim()}>
            {generating ? busyMsg : 'Generate'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {error && <div className="message message--error">{error}</div>}

        {preview && (
          <>
            <div className="micro-action-preview">
              <h3>{preview.name}</h3>
              <div className="component-detail__meta">
                <span className="chip">{preview.type}</span>
                <span className="chip">{preview.station}</span>
                <span className="chip">keeps {preview.shelfLifeDays}d</span>
              </div>
              <p>
                {preview.ingredients.length} ingredient{preview.ingredients.length === 1 ? '' : 's'},{' '}
                {preview.steps.length} step{preview.steps.length === 1 ? '' : 's'}
              </p>
              {preview.macrosPerServing && (
                <p>
                  {preview.macrosPerServing.kcal} kcal — {preview.macrosPerServing.protein_g}g protein,{' '}
                  {preview.macrosPerServing.carbs_g}g carbs, {preview.macrosPerServing.fat_g}g fat
                </p>
              )}
            </div>
            <div className="button-row">
              <button type="button" className="btn btn--primary" onClick={() => onApply(preview)}>
                Apply
              </button>
              <button type="button" className="btn" onClick={() => setPreview(null)}>
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
