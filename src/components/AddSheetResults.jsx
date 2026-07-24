import { splitMatch } from '../textMatch.js'

// Grouped, ranked result list for AddLogItemSheet's unified search (Round 2
// spec point 1) — purely presentational. AddLogItemSheet computes each
// group's rows (already filtered/ranked/labeled) and owns what tapping a
// row does: immediate log for TODAY'S PLAN/RECENT, staging the shared
// amount step for PANTRY/COMMON FOODS/MY DISHES.
//
// Round 2.6: `query` bolds the matched substring in each row's name
// (screens/add-sheet.html); `onGroupRef` lets the sheet's "From plan"
// action-grid button scroll straight to the TODAY'S PLAN group without this
// component needing to know anything about scrolling itself.
function MatchedName({ text, query }) {
  return splitMatch(text, query).map((seg, i) =>
    seg.match ? (
      <span key={i} className="match-highlight">
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  )
}

export default function AddSheetResults({ groups, query, onPick, hasQuery, onGroupRef }) {
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
        <div key={g.key} className="add-sheet__group" ref={onGroupRef ? (el) => onGroupRef(g.key, el) : undefined}>
          <h3 className="add-sheet__group-title">{g.title}</h3>
          {g.rows.map((row) => (
            <button key={row.id} type="button" className="row2 add-sheet__row" onClick={() => onPick(g.key, row.id)}>
              <span className="row2__main">
                <span className="row2__name">
                  <MatchedName text={row.label} query={query} />
                </span>
                {row.sublabel && <span className="row2__sub">{row.sublabel}</span>}
              </span>
              <span className="row2__side">
                {row.kcal != null && <span className="row2__num">{Math.round(row.kcal)}</span>}
                <span className="add-sheet__row-plus" aria-hidden="true">
                  +
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
