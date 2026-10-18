import * as storage from '../storage.js'
import { applyHaul, removeRestocked } from '../stockOps.js'
import FreeTextParseSheet from './FreeTextParseSheet.jsx'

/**
 * Phase 20 "🛒 Restock from shopping": dictate the haul, review it, then
 * restock — stated amounts add up ("4 carrots" + "10 carrots"), unstated
 * ones mark the item plenty, new things become on-hand pantry items, and
 * anything bought drops off the advisory grocery list. Self-contained
 * (writes pantry + grocery through storage) so PantryScreen only renders it.
 */
export default function RestockSheet({ byok, pantry, categories, components, onDone, onCancel }) {
  async function handleConfirm(rows) {
    const { pantry: nextPantry, restockedNames, created } = applyHaul(pantry, categories, rows)
    await storage.set('pantry', nextPantry)
    const grocery = await storage.get('grocery')
    const nextGrocery = removeRestocked(grocery, restockedNames)
    if (nextGrocery.length !== grocery.length) await storage.set('grocery', nextGrocery)
    const restocked = restockedNames.length - created.length
    onDone([restocked > 0 && `${restocked} restocked`, created.length > 0 && `${created.length} added`].filter(Boolean).join(' · '))
  }

  return (
    <FreeTextParseSheet
      mode="haul"
      byok={byok}
      pantry={pantry}
      categories={categories}
      components={components}
      confirmLabel="Restock pantry"
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  )
}
