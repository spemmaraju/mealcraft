export default function ComponentDetail({ component, onBack, onEdit }) {
  return (
    <div className="component-detail">
      <div className="component-detail__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onEdit(component.id)}>
          Edit
        </button>
      </div>

      <div className="component-detail__body">
        <h1 className="component-detail__title">{component.name}</h1>

        <div className="component-detail__meta">
          <span className="chip">{component.type}</span>
          <span className="chip">{component.station}</span>
          <span className="chip">
            {component.activeMin}m active / {component.passiveMin}m passive
          </span>
          <span className="chip">keeps {component.shelfLifeDays}d</span>
          {component.storage && <span className="chip">{component.storage}</span>}
          {component.servings != null && <span className="chip">{component.servings} servings/batch</span>}
        </div>

        {component.ingredients.length > 0 && (
          <div className="component-detail__section">
            <h2>Ingredients</h2>
            {component.ingredients.map((ing, i) => (
              <div className="component-detail__ingredient" key={i}>
                <span>{ing.name}</span>
                <span>{ing.measure}</span>
              </div>
            ))}
          </div>
        )}

        {component.steps.length > 0 && (
          <div className="component-detail__section">
            <h2>Steps</h2>
            <ol className="component-detail__steps">
              {component.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {component.macrosPerServing && (
          <div className="component-detail__section">
            <h2>
              Macros per serving <span className="provenance-tag">{component.macroSource}</span>
            </h2>
            <div className="component-detail__macros">
              <span>{component.macrosPerServing.kcal} kcal</span>
              <span>{component.macrosPerServing.protein_g}g protein</span>
              <span>{component.macrosPerServing.carbs_g}g carbs</span>
              <span>{component.macrosPerServing.fat_g}g fat</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
