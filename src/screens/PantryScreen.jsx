import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as pantryOps from '../pantryOps.js'
import * as nutritionOps from '../nutritionOps.js'
import PantryItemRow from '../components/PantryItemRow.jsx'
import PantryItemEditor from '../components/PantryItemEditor.jsx'
import CategoryManager from '../components/CategoryManager.jsx'

const ROLE_CHIPS = [
  { label: 'Staples', role: 'staple' },
  { label: 'Rotating', role: 'rotating' },
]

export default function PantryScreen() {
  const [pantry, setPantry] = useState([])
  const [categories, setCategories] = useState([])
  const [components, setComponents] = useState([])
  const [settings, setSettings] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState(null)
  const [onHandOnly, setOnHandOnly] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [addingIn, setAddingIn] = useState(null)
  const [addText, setAddText] = useState('')

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

  function commitAdd(category) {
    const name = addText.trim()
    if (!name) {
      setAddingIn(null)
      return
    }
    const nutrition = nutritionOps.findSeedForName(name)
    persist(pantryOps.addItem(pantry, { name, category, onHand: true, role: 'rotating', nutrition }))
    setAddText('')
  }

  const filtered = pantryOps.filterItems(pantry, { search, role: roleFilter, onHandOnly })
  const known = new Set(categories)
  const otherItems = filtered.filter((item) => !known.has(item.category))
  const editingItem = editingItemId ? pantry.find((i) => i.id === editingItemId) : null
  const byok = settings?.apiMode === 'byok' && settings.apiKey ? { provider: settings.provider, apiKey: settings.apiKey } : null

  function renderSection(category, items) {
    return (
      <section className="pantry-section" key={category}>
        <h2 className="pantry-section__title">{category}</h2>
        {items.map((item) => (
          <PantryItemRow key={item.id} item={item} onToggleOnHand={handleToggleOnHand} onOpenEditor={setEditingItemId} />
        ))}
        {addingIn === category ? (
          <input
            type="text"
            className="pantry-fast-add__input"
            autoFocus
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd(category)
              if (e.key === 'Escape') setAddingIn(null)
            }}
            onBlur={() => commitAdd(category)}
            placeholder="Item name"
          />
        ) : (
          <button type="button" className="pantry-fast-add__btn" onClick={() => startAdd(category)}>
            + Add item
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="screen">
      <h1>Pantry</h1>

      <div className="pantry-filters">
        <input
          type="text"
          className="pantry-filters__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pantry"
        />
        <div className="pantry-filters__chips">
          {ROLE_CHIPS.map(({ label, role }) => (
            <button
              key={role}
              type="button"
              className={`chip${roleFilter === role ? ' chip--active' : ''}`}
              onClick={() => setRoleFilter(roleFilter === role ? null : role)}
            >
              {label}
            </button>
          ))}
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
