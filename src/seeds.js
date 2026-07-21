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

function item(name, category, roughQty = null, onHand = true) {
  return createPantryItem({ name, category, onHand, roughQty })
}

export function seedPantryItems() {
  return [
    // Spices
    item('Cumin seeds', 'Spices'),
    item('Coriander powder', 'Spices'),
    item('Turmeric powder', 'Spices'),
    item('Chili powder', 'Spices'),
    item('Garam masala', 'Spices'),
    item('Mustard seeds', 'Spices'),
    item('Hing (asafoetida)', 'Spices'),
    item('Black pepper', 'Spices'),
    item('Salt', 'Spices'),

    // Condiments & Sauces
    item('Soy sauce', 'Condiments & Sauces'),
    item('Vinegar', 'Condiments & Sauces'),
    item('Tahini', 'Condiments & Sauces'),
    item('Peanut butter', 'Condiments & Sauces'),
    item('Sriracha', 'Condiments & Sauces'),

    // Oils & Fats
    item('Olive oil', 'Oils & Fats'),
    item('Neutral oil', 'Oils & Fats'),
    item('Ghee', 'Oils & Fats'),

    // Grains & Bases
    item('Basmati rice', 'Grains & Bases', '5 lb bag'),
    item('Quinoa', 'Grains & Bases', 'half bag'),
    item('Rolled oats', 'Grains & Bases'),
    item('Millet', 'Grains & Bases'),

    // Legumes
    item('Chickpeas (canned)', 'Legumes', '3 cans'),
    item('Chickpeas (dry)', 'Legumes'),
    item('Toor dal', 'Legumes'),
    item('Masoor dal', 'Legumes'),
    item('Chana dal', 'Legumes'),

    // Proteins
    item('Tofu', 'Proteins', '1 block'),
    item('Paneer', 'Proteins', '1 block'),
    item('Eggs', 'Proteins', '1 dozen'),

    // Vegetables
    item('Onions', 'Vegetables'),
    item('Garlic', 'Vegetables'),
    item('Ginger', 'Vegetables'),
    item('Tomatoes', 'Vegetables'),
    item('Seasonal vegetables', 'Vegetables'),

    // Fruits
    item('Lemons', 'Fruits'),

    // Nuts Seeds & Finishers
    item('Peanuts', 'Nuts Seeds & Finishers'),
    item('Sesame seeds', 'Nuts Seeds & Finishers'),
    item('Almonds', 'Nuts Seeds & Finishers'),

    // Dairy
    item('Yogurt', 'Dairy'),
    item('Milk', 'Dairy'),
    item('Butter', 'Dairy'),

    // Frozen
    item('Frozen peas', 'Frozen'),
    item('Frozen spinach', 'Frozen'),
  ]
}
