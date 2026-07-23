// Grouped, ranked result list for AddLogItemSheet's unified search (Round 2
// spec point 1) — purely presentational. AddLogItemSheet computes each
// group's rows (already filtered/ranked/labeled) and owns what tapping a
// row does: immediate log for TODAY'S PLAN/RECENT, staging the shared
// amount step for PANTRY/COMMON FOODS/MY DISHES.
export default function AddSheetResults({ groups, onPick, hasQuery }) {
  const visible = groups.filter((g) => g.rows.length > 0)

  if (visible.length === 0) {
    // Hot-fix #5: an untyped search box showing "No matches" reads as a
    // false negative (nothing has been searched for yet). Only say "no
    // matches" once the user has actually typed something.
    return hasQuery ? (
      <p className="library-empty">No matches — try a different search, or use Search online / Scan below.</p>
    ) : (
      <p className="library-empty">Type to search pantry, common foods, or your dishes.</p>
    )
  }

  return (
    <div className="picker-sheet__list add-sheet__list">
      {visible.map((g) => (
        <div key={g.key} className="add-sheet__group">
          <h3 className="add-sheet__group-title">{g.title}</h3>
          {g.rows.map((row) => (
            <button key={row.id} type="button" className="picker-sheet__row add-sheet__row" onClick={() => onPick(g.key, row.id)}>
              <span className="picker-sheet__name">
                {row.label}
                {row.sublabel && <span className="add-sheet__row-sub"> — {row.sublabel}</span>}
              </span>
              <span className="add-sheet__row-plus" aria-hidden="true">
                +
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
