import type { Library, StoreSection } from '../data/types';
import { STORE_SECTIONS } from '../data/types';
import { formatAmount, type IngredientLine } from './meals';

/**
 * The shopping list is a DIFFERENT DOCUMENT from the packing list. It is used
 * at a different time, in a different building, and it is organised by where
 * things are in the shop rather than by which bin they end up in.
 */

export interface ShoppingItem {
  key: string;
  name: string;
  amount: string;
  section: StoreSection;
  meals: string[];
  /** A pantry staple believed to be in stock: shown, struck through, not bought. */
  pantryInStock: boolean;
  allergens: string[];
  /** Allergens that clash with somebody actually on this trip. */
  conflicts: string[];
}

export interface ShoppingSection {
  section: StoreSection;
  label: string;
  items: ShoppingItem[];
}

const SECTION_LABELS: Record<StoreSection, string> = {
  produce: 'Produce',
  meat: 'Meat and fish',
  dairy: 'Dairy and chilled',
  bakery: 'Bakery',
  'dry-goods': 'Dry goods',
  canned: 'Canned and jars',
  frozen: 'Frozen',
  drinks: 'Drinks',
  household: 'Household',
};

export function shoppingList(
  lines: IngredientLine[],
  library: Library,
  attendeeIds: string[],
): ShoppingSection[] {
  const allergiesOnTrip = new Set(
    library.people
      .filter((p) => attendeeIds.includes(p.id))
      .flatMap((p) => p.allergies ?? [])
      .map((a) => a.toLowerCase()),
  );

  const items: ShoppingItem[] = lines.map((line) => {
    const allergens = line.ingredient.allergens ?? [];
    return {
      key: line.key,
      name: line.ingredient.name,
      amount: formatAmount(line.amount, line.ingredient.unit),
      section: line.ingredient.section,
      meals: line.meals,
      pantryInStock: Boolean(line.ingredient.pantryStaple) && line.inStock,
      allergens,
      conflicts: allergens.filter((a) => allergiesOnTrip.has(a.toLowerCase())),
    };
  });

  return STORE_SECTIONS.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    items: items
      .filter((item) => item.section === section)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}

/** What you would actually buy, ignoring staples already in the pantry box. */
export function toBuyCount(sections: ShoppingSection[]): number {
  return sections.reduce(
    (sum, group) => sum + group.items.filter((i) => !i.pantryInStock).length,
    0,
  );
}

export function shoppingListToText(sections: ShoppingSection[]): string {
  const out: string[] = ['SHOPPING LIST', '='.repeat(40), ''];
  for (const group of sections) {
    const buying = group.items.filter((i) => !i.pantryInStock);
    if (buying.length === 0) continue;
    out.push(`-- ${group.label.toUpperCase()}`);
    for (const item of buying) {
      out.push(`[ ] ${item.name}  ${item.amount}${item.conflicts.length ? '  ** ALLERGEN **' : ''}`);
    }
    out.push('');
  }
  const inStock = sections.flatMap((g) => g.items.filter((i) => i.pantryInStock));
  if (inStock.length) {
    out.push('-- ALREADY IN THE PANTRY BOX (not buying)');
    for (const item of inStock) out.push(`    ${item.name}`);
  }
  return out.join('\n');
}
