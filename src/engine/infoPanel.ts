import type {
  Cond,
  Item,
  Library,
  LeafCond,
  NumericField,
  QtyUnit,
  SetField,
  SiteQuestion,
} from '../data/types';
import { SITE_QUESTION_LABELS } from '../data/types';
import { condToEnglish, namesFrom, humanise } from './english';

/**
 * Every section of the trip screen has an info button that opens this: every
 * rule in the library that reads that section's variables, grouped by value,
 * computed live from the library itself.
 *
 * It is never a hand-written explanation. If nobody has written a rule against
 * a value, the panel says "nothing depends on this yet", which is useful
 * information rather than an empty state to apologise for.
 */

/**
 * The variables a trip section owns.
 *
 * `qtyUnit` exists because some sections drive *quantities* rather than
 * conditions — the sleeping arrangement is the case: no rule asks how many
 * shelters there are, but tents, footprints and lanterns all count from it.
 * Without this the section would have no info button, which would wrongly
 * imply nothing depends on it.
 */
export type InfoField =
  | { kind: 'numeric'; field: NumericField }
  | { kind: 'set'; field: SetField }
  | { kind: 'site'; question: SiteQuestion }
  | { kind: 'qtyUnit'; unit: QtyUnit };

export interface InfoEntry {
  item: Item;
  /** Is this item on the current list right now? */
  packing: boolean;
  /** The specific condition that reads this value, in plain English. */
  because: string;
}

export interface InfoGroup {
  /** The value these rules key off: an activity id, a threshold, "yes"/"no". */
  key: string;
  label: string;
  entries: InfoEntry[];
}

export interface InfoPanelData {
  label: string;
  groups: InfoGroup[];
  /** Distinct items reading this field at all. */
  itemCount: number;
}

function walkLeaves(cond: Cond): LeafCond[] {
  return cond.kind === 'group' ? cond.conds : [cond];
}

function matches(leaf: LeafCond, field: InfoField): boolean {
  if (field.kind === 'numeric') return leaf.kind === 'numeric' && leaf.field === field.field;
  if (field.kind === 'set') return leaf.kind === 'set' && leaf.field === field.field;
  if (field.kind === 'site') return leaf.kind === 'site' && leaf.question === field.question;
  return false; // qtyUnit reads quantities, not conditions.
}

/** The value(s) a condition keys off, used to bucket the panel. */
function keysFor(leaf: LeafCond, field: InfoField): { key: string; label: string }[] {
  if (field.kind === 'set' && leaf.kind === 'set') {
    const prefix = leaf.not ? 'none of: ' : '';
    return leaf.values.map((value) => ({ key: `${prefix}${value}`, label: value }));
  }
  if (field.kind === 'numeric' && leaf.kind === 'numeric') {
    const op = leaf.op === 'atLeast' ? '≥' : leaf.op === 'atMost' ? '≤' : '=';
    return [{ key: `${op}${leaf.value}`, label: `${op} ${leaf.value}` }];
  }
  if (field.kind === 'site' && leaf.kind === 'site') {
    return [{ key: leaf.value ? 'yes' : 'no', label: leaf.value ? 'Answered yes' : 'Answered no' }];
  }
  return [];
}

export function infoPanelFor(
  field: InfoField,
  library: Library,
  packingIds: Set<string>,
): InfoPanelData {
  const names = namesFrom(library);

  // Quantity dependencies are not conditions, so they are found on qty, not rule.
  if (field.kind === 'qtyUnit') {
    const entries: InfoEntry[] = library.items
      .filter((item) => item.qty.unit === field.unit && item.qty.rate !== 0)
      .map((item) => ({
        item,
        packing: packingIds.has(item.id),
        because: `${item.qty.base ? `${item.qty.base} plus ` : ''}${item.qty.rate} per ${humanise(
          field.unit.replace(/^per/, ''),
        )}${item.qty.cap !== undefined ? `, capped at ${item.qty.cap}` : ''}`,
      }));
    return {
      label: `how many ${humanise(field.unit.replace(/^per/, ''))}s there are`,
      groups: entries.length ? [{ key: field.unit, label: 'Counts from this', entries }] : [],
      itemCount: entries.length,
    };
  }

  const groups = new Map<string, InfoGroup>();
  const seenItems = new Set<string>();

  for (const item of library.items) {
    for (const top of item.rule.conds) {
      for (const leaf of walkLeaves(top)) {
        if (!matches(leaf, field)) continue;
        seenItems.add(item.id);
        for (const { key, label } of keysFor(leaf, field)) {
          const group = groups.get(key) ?? { key, label: labelFor(field, label, names), entries: [] };
          // One entry per item per group, even if two conditions overlap.
          if (!group.entries.some((e) => e.item.id === item.id)) {
            group.entries.push({
              item,
              packing: packingIds.has(item.id),
              because: condToEnglish(leaf, names),
            });
          }
          groups.set(key, group);
        }
      }
    }
  }

  return {
    label: labelForField(field),
    groups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)),
    itemCount: seenItems.size,
  };
}

function labelFor(field: InfoField, raw: string, names: ReturnType<typeof namesFrom>): string {
  if (field.kind === 'set') return names.label(field.field, raw);
  return raw;
}

function labelForField(field: InfoField): string {
  if (field.kind === 'site') return SITE_QUESTION_LABELS[field.question];
  if (field.kind === 'qtyUnit') return humanise(field.unit);
  return humanise(field.field);
}

/** A whole trip section: several fields, each with its own panel. */
export function infoPanelsFor(
  fields: InfoField[],
  library: Library,
  packingIds: Set<string>,
): InfoPanelData[] {
  return fields.map((field) => infoPanelFor(field, library, packingIds));
}
