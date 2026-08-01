import type { Id, Item, Library, Person, Trip } from '../data/types';
import { deriveFacts, type TripFacts } from './facts';
import { evalRule, type RuleTrace } from './conditions';
import { evalQuantity, type QtyTrace } from './quantity';
import { namesFrom } from './english';

/**
 * One line on the generated list. It carries its own justification: `why` is the
 * evaluated rule, not a copy of it, so a row can always answer "why is this
 * here" from the same data that put it here.
 */
export interface ListLine {
  /** Stable within a build; used as the session checkbox key. */
  key: string;
  item: Item;
  qty: number;
  /** Present when the line was issued to one specific person. */
  person?: Person;
  why: RuleTrace;
  howMany: QtyTrace;
  weight_g: number;
}

/**
 * What the meal plan contributes to the PACKING list. Typed here rather than
 * imported from engine/meals so the core builder keeps no dependency on food.
 *
 * Three distinct categories, as the brief requires: cooking instruments and
 * eating instruments arrive as `requiredItems` (they are library items, and a
 * meal can pull one in that no rule would have), and the ingredients arrive as
 * `ingredients`, because they are not library items at all.
 */
export interface MealContribution {
  requiredItems: { itemId: Id; reasons: string[]; role: string }[];
  ingredients: {
    key: string;
    name: string;
    amount: string;
    cold: 'ambient' | 'refrigerated' | 'frozen';
    meals: string[];
  }[];
}

export interface BuildResult {
  lines: ListLine[];
  /** Items excluded, with the trace showing which condition failed. */
  excluded: { item: Item; why: RuleTrace }[];
  /** Items whose last trigger was deleted. Never packed, always surfaced. */
  orphaned: Item[];
  facts: TripFacts;
  totalWeight_g: number;
  weightByPerson: Record<Id, number>;
}

export function buildList(
  trip: Trip,
  library: Library,
  meals?: MealContribution,
): BuildResult {
  const facts = deriveFacts(trip, library);
  const names = namesFrom(library);

  const lines: ListLine[] = [];
  const excluded: BuildResult['excluded'] = [];
  const orphaned: Item[] = [];

  const requiredByMeals = new Map(
    (meals?.requiredItems ?? []).map((r) => [r.itemId, r]),
  );

  for (const item of library.items) {
    // An orphan is quarantined, not evaluated. Its rule is known to be broken,
    // so any answer it produced would be noise.
    if (item.orphaned || item.rule.conds.length === 0) {
      orphaned.push(item);
      continue;
    }

    if (item.qty.perPerson) {
      // Expand per attendee, and evaluate the rule *for that person*, so a
      // toddler-only item lands on the toddler and nobody else.
      let anyPassed = false;
      let lastWhy: RuleTrace | undefined;
      for (const person of facts.attendees) {
        const why = evalRule(item.rule, facts, { subject: person, names });
        lastWhy = why;
        if (!why.passed) continue;
        anyPassed = true;
        const howMany = evalQuantity(item.qty, facts, person);
        if (howMany.value <= 0) continue;
        lines.push({
          key: `${item.id}::${person.id}`,
          item,
          qty: howMany.value,
          person,
          why,
          howMany,
          weight_g: item.weight_g * howMany.value,
        });
      }
      if (!anyPassed && lastWhy) excluded.push({ item, why: lastWhy });
      // Nobody is going: still record why, against the group.
      if (!anyPassed && !lastWhy) {
        excluded.push({ item, why: evalRule(item.rule, facts, { names }) });
      }
      continue;
    }

    const why = evalRule(item.rule, facts, { names });
    if (!why.passed) {
      // A meal can pull in an instrument no rule would have packed. It still
      // has to say why, so it carries a trace naming the meals that need it.
      const required = requiredByMeals.get(item.id);
      if (required) {
        lines.push({
          key: item.id,
          item,
          qty: 1,
          why: mealTrace(required.role, required.reasons),
          howMany: { value: 1, english: 'one, because the meal plan needs it', unitCount: 0 },
          weight_g: item.weight_g,
        });
        continue;
      }
      excluded.push({ item, why });
      continue;
    }
    const howMany = evalQuantity(item.qty, facts);
    if (howMany.value <= 0) {
      excluded.push({ item, why });
      continue;
    }
    lines.push({
      key: item.id,
      item,
      qty: howMany.value,
      why,
      howMany,
      weight_g: item.weight_g * howMany.value,
    });
  }

  // The ingredients themselves. Not library items, so they are built here and
  // filed by cold chain: frozen and chilled to the cooler, everything else to
  // the pantry box.
  for (const ingredient of meals?.ingredients ?? []) {
    const item: Item = {
      id: `ingredient:${ingredient.key}`,
      name: `${ingredient.name} — ${ingredient.amount}`,
      category: 'food',
      container: ingredient.cold === 'ambient' ? 'pantry-box' : 'cooler',
      rule: { mode: 'all', conds: [{ kind: 'always' }] },
      qty: { base: 1, rate: 0, unit: 'flat' },
      weight_g: 0,
      phase: ingredient.cold === 'ambient' ? 'night-before' : 'morning-of',
      kind: 'consumable',
      type: 'gear',
      ownership: 'group',
      scented: true,
      note: `For ${ingredient.meals.join(', ')}.`,
    };
    lines.push({
      key: item.id,
      item,
      qty: 1,
      why: mealTrace('ingredient', ingredient.meals),
      howMany: { value: 1, english: ingredient.amount, unitCount: 0 },
      weight_g: 0,
    });
  }

  const weightByPerson: Record<Id, number> = {};
  for (const line of lines) {
    if (line.person) {
      weightByPerson[line.person.id] = (weightByPerson[line.person.id] ?? 0) + line.weight_g;
    }
  }

  return {
    lines,
    excluded,
    orphaned,
    facts,
    totalWeight_g: lines.reduce((sum, l) => sum + l.weight_g, 0),
    weightByPerson,
  };
}

/**
 * A trace for something the meal plan required rather than a rule. It has the
 * same shape as a rule trace, so every consumer — the "why" disclosure, the
 * text export, the diff — keeps working without special cases.
 */
function mealTrace(role: string, reasons: string[]): RuleTrace {
  const article = /^[aeiou]/i.test(role) ? 'an' : 'a';
  const english = `On the list as ${article} ${role} for the meal plan`;
  return {
    passed: true,
    english,
    conds: reasons.map((reason) => ({
      cond: { kind: 'always' },
      passed: true,
      english: reason,
      actual: '',
    })),
  };
}

// ---------------------------------------------------------------------------
// Grouping — container / category / person / responsibility are all "group by".
// The timeline is not a sort; it lives in its own view.
// ---------------------------------------------------------------------------

export type GroupBy = 'container' | 'category' | 'person' | 'phase';

export interface ListGroup {
  key: string;
  label: string;
  lines: ListLine[];
  weight_g: number;
}

export function groupLines(
  lines: ListLine[],
  by: GroupBy,
  library: Library,
): ListGroup[] {
  const buckets = new Map<string, ListLine[]>();
  const labels = new Map<string, string>();

  for (const line of lines) {
    let key: string;
    let label: string;
    switch (by) {
      case 'container':
        key = line.item.container;
        label = library.containers.find((c) => c.id === key)?.name ?? 'Unassigned';
        break;
      case 'category':
        key = line.item.category;
        label = line.item.category;
        break;
      case 'person':
        key = line.person?.id ?? '__group';
        label = line.person?.name ?? 'Group gear';
        break;
      case 'phase':
        key = line.item.phase;
        label = line.item.phase;
        break;
    }
    labels.set(key, label);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(line);
    else buckets.set(key, [line]);
  }

  return [...buckets.entries()].map(([key, groupLines_]) => ({
    key,
    label: labels.get(key) ?? key,
    lines: groupLines_,
    weight_g: groupLines_.reduce((sum, l) => sum + l.weight_g, 0),
  }));
}
