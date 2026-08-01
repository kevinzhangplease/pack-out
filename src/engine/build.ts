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

export function buildList(trip: Trip, library: Library): BuildResult {
  const facts = deriveFacts(trip, library);
  const names = namesFrom(library);

  const lines: ListLine[] = [];
  const excluded: BuildResult['excluded'] = [];
  const orphaned: Item[] = [];

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
