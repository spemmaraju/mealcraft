// Default pantry data: category list + starter items. Data only, no logic.

import { createPantryItem } from './schema.js'

export const DEFAULT_CATEGORIES = [
  'Spices',
  'Condiments & Sauces',
  'Oils & Fats',
  'Grains & Bases',
  'Legumes',
  'Proteins',
  'Vegetables',
  'Fruits',
  'Nuts Seeds & Finishers',
  'Dairy',
  'Frozen',
]

function staple(name, category, roughQty = null) {
  return createPantryItem({ name, category, role: 'staple', onHand: true, roughQty })
}

function rotating(name, category, roughQty = null, onHand = true) {
  return createPantryItem({ name, category, role: 'rotating', onHand, roughQty })
}

export function seedPantryItems() {
  return [
    // Spices
    staple('Cumin seeds', 'Spices'),
    staple('Coriander powder', 'Spices'),
    staple('Turmeric powder', 'Spices'),
    staple('Chili powder', 'Spices'),
    staple('Garam masala', 'Spices'),
    staple('Mustard seeds', 'Spices'),
    staple('Hing (asafoetida)', 'Spices'),
    staple('Black pepper', 'Spices'),
    staple('Salt', 'Spices'),

    // Condiments & Sauces
    staple('Soy sauce', 'Condiments & Sauces'),
    staple('Vinegar', 'Condiments & Sauces'),
    staple('Tahini', 'Condiments & Sauces'),
    staple('Peanut butter', 'Condiments & Sauces'),
    rotating('Sriracha', 'Condiments & Sauces'),

    // Oils & Fats
    staple('Olive oil', 'Oils & Fats'),
    staple('Neutral oil', 'Oils & Fats'),
    staple('Ghee', 'Oils & Fats'),

    // Grains & Bases
    staple('Basmati rice', 'Grains & Bases', '5 lb bag'),
    staple('Quinoa', 'Grains & Bases', 'half bag'),
    staple('Rolled oats', 'Grains & Bases'),
    rotating('Millet', 'Grains & Bases'),

    // Legumes
    staple('Chickpeas (canned)', 'Legumes', '3 cans'),
    staple('Chickpeas (dry)', 'Legumes'),
    staple('Toor dal', 'Legumes'),
    staple('Masoor dal', 'Legumes'),
    staple('Chana dal', 'Legumes'),

    // Proteins
    rotating('Tofu', 'Proteins', '1 block'),
    rotating('Paneer', 'Proteins', '1 block'),
    staple('Eggs', 'Proteins', '1 dozen'),

    // Vegetables
    staple('Onions', 'Vegetables'),
    staple('Garlic', 'Vegetables'),
    staple('Ginger', 'Vegetables'),
    rotating('Tomatoes', 'Vegetables'),
    rotating('Seasonal vegetables', 'Vegetables'),

    // Fruits
    staple('Lemons', 'Fruits'),

    // Nuts Seeds & Finishers
    staple('Peanuts', 'Nuts Seeds & Finishers'),
    staple('Sesame seeds', 'Nuts Seeds & Finishers'),
    staple('Almonds', 'Nuts Seeds & Finishers'),

    // Dairy
    rotating('Yogurt', 'Dairy'),
    rotating('Milk', 'Dairy'),
    staple('Butter', 'Dairy'),

    // Frozen
    staple('Frozen peas', 'Frozen'),
    staple('Frozen spinach', 'Frozen'),
  ]
}
