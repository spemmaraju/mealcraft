import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as componentOps from '../componentOps.js'
import { createComponent, COMPONENT_TYPES } from '../schema.js'
import ComponentRow from '../components/ComponentRow.jsx'
import ComponentEditor from '../components/ComponentEditor.jsx'
import ComponentDetail from '../components/ComponentDetail.jsx'
import MicroActionSheet from '../components/MicroActionSheet.jsx'

const RATING_CHIPS = [
  { label: 'Repeat', value: 'repeat' },
  { label: 'Fine', value: 'fine' },
  { label: 'Never', value: 'never' },
]

export default function LibraryScreen() {
  const [components, setComponents] = useState([])
  const [pantry, setPantry] = useState([])
  const [settings, setSettings] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(null)
  const [tagFilter, setTagFilter] = useState(null)
  const [ratingFilter, setRatingFilter] = useState(null)
  const [makeableOnly, setMakeableOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [newDraft, setNewDraft] = useState(null)
  const [viewingId, setViewingId] = useState(null)
  const [regenerating, setRegenerating] = useState(null)

  async function reload() {
    const [c, p, s] = await Promise.all([storage.get('components'), storage.get('pantry'), storage.get('settings')])
    setComponents(c)
    setPantry(p)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  async function persist(nextComponents) {
    await storage.set('components', nextComponents)
  }

  function handleOpenNew() {
    setNewDraft(createComponent())
    setEditingId('new')
  }

  function handleOpenDetail(id) {
    setViewingId(id)
  }

  function handleEditFromDetail(id) {
    setViewingId(null)
    setEditingId(id)
  }

  function handleSaveComponent(id, patch) {
    const base = editingId === 'new' ? newDraft : components.find((c) => c.id === id)
    persist(componentOps.upsertComponent(components, { ...base, ...patch }))
    setEditingId(null)
    setNewDraft(null)
  }

  function handleDeleteComponent(id) {
    persist(componentOps.deleteComponent(components, id))
    setEditingId(null)
    if (viewingId === id) setViewingId(null)
  }

  function handleCancelEditor() {
    setEditingId(null)
    setNewDraft(null)
  }

  function handleRate(id, rating) {
    persist(componentOps.updateComponent(components, id, { rating }))
  }

  function handleApplyRegenerate(newComponent) {
    const replaced = { ...newComponent, id: regenerating.id, rating: regenerating.rating }
    persist(componentOps.upsertComponent(components, replaced))
    setRegenerating(null)
  }

  const byokActive = !!(settings && settings.apiMode === 'byok' && settings.apiKey)
  const makeability = componentOps.makeabilityMap(components, pantry)
  const filtered = componentOps.filterComponents(
    components,
    { search, type: typeFilter, cuisineTag: tagFilter, rating: ratingFilter, makeableOnly, includeArchived: showArchived },
    makeability,
  )
  const cuisineTags = componentOps.allCuisineTags(components)
  const archivedCount = components.filter((c) => c.archived).length
  const editingComponent = editingId === 'new' ? newDraft : editingId ? components.find((c) => c.id === editingId) : null
  const viewingComponent = viewingId ? components.find((c) => c.id === viewingId) : null

  return (
    <div className="screen">
      <h1>Library</h1>
      <button type="button" className="btn btn--primary" onClick={handleOpenNew}>
        ＋ New component
      </button>

      <div className="library-filters">
        <input
          type="text"
          className="library-filters__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ingredient"
        />
        <div className="library-filters__chips">
          {COMPONENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${typeFilter === t ? ' chip--active' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="library-filters__chips">
          <button
            type="button"
            className={`chip${makeableOnly ? ' chip--active' : ''}`}
            onClick={() => setMakeableOnly((v) => !v)}
          >
            Makeable now
          </button>
          {RATING_CHIPS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              className={`chip${ratingFilter === value ? ' chip--active' : ''}`}
              onClick={() => setRatingFilter(ratingFilter === value ? null : value)}
            >
              {label}
            </button>
          ))}
        </div>
        {cuisineTags.length > 0 && (
          <div className="library-filters__chips">
            {cuisineTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`chip${tagFilter === tag ? ' chip--active' : ''}`}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        <div className="library-filters__chips">
          <button
            type="button"
            className={`chip${showArchived ? ' chip--active' : ''}`}
            onClick={() => setShowArchived((v) => !v)}
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {components.length === 0 ? (
        <p className="library-empty">
          Nothing saved yet. Save a dish and a sauce to get started — your Library builds up as you cook.
        </p>
      ) : filtered.length === 0 ? (
        <p className="library-empty">No components match these filters.</p>
      ) : (
        filtered.map((component) => (
          <ComponentRow
            key={component.id}
            component={component}
            status={makeability[component.id]}
            onOpenDetail={handleOpenDetail}
            onRate={handleRate}
          />
        ))
      )}

      {editingComponent && (
        <ComponentEditor
          component={editingComponent}
          isNew={editingId === 'new'}
          pantry={pantry}
          onSave={handleSaveComponent}
          onDelete={handleDeleteComponent}
          onCancel={handleCancelEditor}
        />
      )}

      {viewingComponent && (
        <ComponentDetail
          component={viewingComponent}
          byokActive={byokActive}
          onBack={() => setViewingId(null)}
          onEdit={handleEditFromDetail}
          onRegenerate={setRegenerating}
        />
      )}

      {regenerating && settings && (
        <MicroActionSheet
          mode="regenerate"
          component={regenerating}
          pantry={pantry}
          settings={settings}
          onApply={handleApplyRegenerate}
          onCancel={() => setRegenerating(null)}
        />
      )}
    </div>
  )
}
