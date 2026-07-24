import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import * as pantryOps from '../pantryOps.js'
import * as nutritionOps from '../nutritionOps.js'
import PantryItemRow from '../components/PantryItemRow.jsx'
import PantryItemEditor from '../components/PantryItemEditor.jsx'
import CategoryManager from '../components/CategoryManager.jsx'
import { SearchIcon } from '../components/Icons.jsx'

export default function PantryScreen() {
  const [pantry, setPantry] = useState([])
  const [categories, setCategories] = useState([])
  const [components, setComponents] = useState([])
  const [settings, setSettings] = useState(null)
  const [search, setSearch] = useState('')
  const [onHandOnly, setOnHandOnly] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [addingIn, setAddingIn] = useState(null)
  const [addText, setAddText] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [quickAdding, setQuickAdding] = useState(false)
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddCategory, setQuickAddCategory] = useState('')
  const [lastCategory, setLastCategory] = useState(null)
  const [autofillToast, setAutofillToast] = useState(null) // { itemId, text } | null
  // Set by Enter in the quick-add input just before it blurs; blur owns the
  // single commit path so Enter-then-blur can't create the item twice.
  const openEditorRef = useRef(false)

  async function reload() {
    const [p, c, comps, s] = await Promise.all([
      storage.get('pantry'),
      storage.get('categories'),
      storage.get('components'),
      storage.get('settings'),
    ])
    setPantry(p)
    setCategories(c)
    setComponents(comps)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  async function persist(nextPantry, nextCategories) {
    if (nextPantry) await storage.set('pantry', nextPantry)
    if (nextCategories) await storage.set('categories', nextCategories)
  }

  function handleToggleOnHand(id, onHand) {
    persist(pantryOps.updateItem(pantry, id, { onHand }))
  }

  function handleSaveItem(id, patch) {
    persist(pantryOps.updateItem(pantry, id, patch))
    setEditingItemId(null)
  }

  function handleDeleteItem(id) {
    persist(pantryOps.deleteItem(pantry, id))
    setEditingItemId(null)
  }

  // Nutrition writes/deletes can change what a 'derived' component resolves
  // to, so every save here re-derives across the board before persisting.
  async function handleSaveNutrition(itemId, nutrition) {
    const nextPantry = pantryOps.updateItem(pantry, itemId, { nutrition })
    await storage.set('pantry', nextPantry)
    const { changed, components: nextComponents } = nutritionOps.resyncDerivedMacros(components, nextPantry)
    if (changed) await storage.set('components', nextComponents)
  }

  function handleCategoryChange(nextCategories, nextPantry) {
    persist(nextPantry, nextCategories)
  }

  function startAdd(category) {
    setAddingIn(category)
    setAddText('')
  }

  function toggleSection(category) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function commitAdd(category) {
    const openEditor = openEditorRef.current
    openEditorRef.current = false
    const name = addText.trim()
    if (!name) {
      setAddingIn(null)
      return
    }
    const nutrition = nutritionOps.findSeedForName(name)
    const { pantry: nextPantry, item } = pantryOps.addItem(pantry, {
      name,
      category,
      onHand: true,
      nutrition,
    })
    persist(nextPantry)
    setAddText('')
    setAddingIn(null)
    setLastCategory(category)
    if (openEditor) setEditingItemId(item.id)
    else if (nutrition) setAutofillToast({ itemId: item.id, text: `Nutrition auto-filled for "${name}"` })
  }

  function openQuickAdd() {
    setQuickAdding(true)
    setQuickAddName('')
    setQuickAddCategory(lastCategory ?? categories[0] ?? '')
  }

  function cancelQuickAdd() {
    setQuickAdding(false)
    setQuickAddName('')
  }

  function commitQuickAdd() {
    const name = quickAddName.trim()
    if (!name) {
      cancelQuickAdd()
      return
    }
    const category = quickAddCategory || categories[0] || ''
    const nutrition = nutritionOps.findSeedForName(name)
    const { pantry: nextPantry, item } = pantryOps.addItem(pantry, { name, category, onHand: true, nutrition })
    persist(nextPantry)
    setLastCategory(category)
    setQuickAdding(false)
    setQuickAddName('')
    if (nutrition) setAutofillToast({ itemId: item.id, text: `Nutrition auto-filled for "${name}"` })
  }

  const filtered = pantryOps.filterItems(pantry, { search, onHandOnly })
  const searching = search.trim().length > 0
  const known = new Set(categories)
  const otherItems = filtered.filter((item) => !known.has(item.category))
  const editingItem = editingItemId ? pantry.find((i) => i.id === editingItemId) : null
  const byok = settings?.apiMode === 'byok' && settings.apiKey ? { provider: settings.provider, apiKey: settings.apiKey } : null

  function renderSection(category, items) {
    // While searching, sections auto-expand and empty ones drop out entirely
    // so matches aren't buried between blank headers.
    if (searching && items.length === 0) return null
    const open = searching || expanded.has(category)
    const onHandCount = items.filter((item) => item.onHand).length
    return (
      <section className="pantry-section" key={category}>
        <h2 className="pantry-section__title">
          <button
            type="button"
            className="pantry-section__header"
            aria-expanded={open}
            onClick={() => toggleSection(category)}
          >
            <span className="pantry-section__name">{category}</span>
            <span className="pantry-section__count">
              {items.length === 0 ? 'empty' : `${onHandCount}/${items.length} on hand`}
            </span>
            <span className={`pantry-section__chevron${open ? ' pantry-section__chevron--open' : ''}`} aria-hidden="true">
              ▸
            </span>
          </button>
        </h2>
        {open &&
          items.map((item) => (
            <PantryItemRow key={item.id} item={item} onToggleOnHand={handleToggleOnHand} onOpenEditor={setEditingItemId} />
          ))}
        {open && (addingIn === category ? (
          <input
            type="text"
            className="pantry-fast-add__input"
            autoFocus
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                openEditorRef.current = true
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') setAddingIn(null)
            }}
            onBlur={() => commitAdd(category)}
            placeholder="Item name"
          />
        ) : (
          <button type="button" className="pantry-fast-add__btn" onClick={() => startAdd(category)}>
            + Add item
          </button>
        ))}
      </section>
    )
  }

  return (
    <div className="screen">
      <h1>Pantry</h1>

      {autofillToast && (
        <div className="banner">
          <span className="banner__text">{autofillToast.text}</span>
          <div className="banner__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditingItemId(autofillToast.itemId)
                setAutofillToast(null)
              }}
            >
              Tap to review
            </button>
            <button type="button" className="btn banner__dismiss" onClick={() => setAutofillToast(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      <div className="pantry-filters">
        <label className="searchfield">
          <SearchIcon size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pantry"
          />
        </label>
        {quickAdding ? (
          <div className="pantry-quick-add">
            <input
              type="text"
              className="pantry-quick-add__name"
              autoFocus
              value={quickAddName}
              onChange={(e) => setQuickAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitQuickAdd()
                if (e.key === 'Escape') cancelQuickAdd()
              }}
              placeholder="Item name"
            />
            <select
              className="pantry-quick-add__category"
              value={quickAddCategory}
              onChange={(e) => setQuickAddCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--primary" onClick={commitQuickAdd}>
              Add
            </button>
            <button type="button" className="btn" onClick={cancelQuickAdd}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--primary pantry-quick-add__open" onClick={openQuickAdd}>
            + Add item
          </button>
        )}
        <div className="pantry-filters__chips">
          <button
            type="button"
            className={`chip${onHandOnly ? ' chip--active' : ''}`}
            onClick={() => setOnHandOnly((v) => !v)}
          >
            On hand
          </button>
        </div>
        <button type="button" className="btn" onClick={() => setManagingCategories(true)}>
          Edit categories
        </button>
      </div>

      {categories.map((category) => renderSection(category, filtered.filter((item) => item.category === category)))}
      {otherItems.length > 0 && renderSection('Other', otherItems)}

      {editingItem && (
        <PantryItemEditor
          item={editingItem}
          categories={categories}
          fdcKey={settings?.fdcKey ?? null}
          byok={byok}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
          onSaveNutrition={handleSaveNutrition}
          onCancel={() => setEditingItemId(null)}
        />
      )}

      {managingCategories && (
        <CategoryManager
          categories={categories}
          pantry={pantry}
          onChange={handleCategoryChange}
          onClose={() => setManagingCategories(false)}
        />
      )}
    </div>
  )
}
