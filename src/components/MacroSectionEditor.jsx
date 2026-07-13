import { MACRO_SOURCES } from '../schema.js'

export default function MacroSectionEditor({
  servings,
  onServingsChange,
  hasMacros,
  onHasMacrosChange,
  kcal,
  onKcalChange,
  protein,
  onProteinChange,
  carbs,
  onCarbsChange,
  fat,
  onFatChange,
  macroSource,
  onMacroSourceChange,
  onDerive,
  deriveError,
}) {
  return (
    <div className="field">
      <label htmlFor="component-servings">Batch yield (servings)</label>
      <input
        id="component-servings"
        type="text"
        inputMode="numeric"
        value={servings}
        onChange={(e) => onServingsChange(e.target.value)}
        placeholder="e.g. 4"
      />

      <label className="checkbox-field">
        <input type="checkbox" checked={hasMacros} onChange={(e) => onHasMacrosChange(e.target.checked)} />
        Macros per serving
      </label>

      {hasMacros && (
        <>
          <div className="button-row">
            <input type="text" inputMode="numeric" value={kcal} onChange={(e) => onKcalChange(e.target.value)} placeholder="kcal" />
            <input
              type="text"
              inputMode="decimal"
              value={protein}
              onChange={(e) => onProteinChange(e.target.value)}
              placeholder="protein g"
            />
            <input
              type="text"
              inputMode="decimal"
              value={carbs}
              onChange={(e) => onCarbsChange(e.target.value)}
              placeholder="carbs g"
            />
            <input type="text" inputMode="decimal" value={fat} onChange={(e) => onFatChange(e.target.value)} placeholder="fat g" />
          </div>
          <select value={macroSource} onChange={(e) => onMacroSourceChange(e.target.value)}>
            {MACRO_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={onDerive}>
          Derive from ingredients
        </button>
      </div>

      {deriveError && (
        <div className="message message--error">
          Couldn&rsquo;t derive — {deriveError.map((u) => `${u.name} (${u.reason})`).join(', ')}
        </div>
      )}
    </div>
  )
}
