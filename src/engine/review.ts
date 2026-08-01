import type { Item, Library, NumericCond, ReviewOutcome, Trip } from '../data/types';
import { deriveFacts, type TripFacts } from './facts';
import { ruleToEnglish, namesFrom } from './english';
import { upsertItem } from './mutations';
import { buildList } from './build';

/**
 * The learning loop.
 *
 * Because rules are data, a post-trip review does not have to stop at "the
 * screen shelter went unused". It can compute what the rule would have had to
 * say for that not to happen, and offer the edit. Nothing else in this app
 * compounds the way this does.
 *
 * Two rules of conduct here:
 *
 *  - A proposal always names the evidence. "Unused on two trips" with the trips
 *    listed, not "consider raising this".
 *  - A proposal that cannot be computed honestly is advisory and says so,
 *    rather than inventing an edit. `apply: null` means "we have no defensible
 *    automatic change, here is the observation".
 */

export type ProposalKind =
  | 'tighten-threshold'
  | 'loosen-threshold'
  | 'mark-needs-repair'
  | 'reduce-quantity'
  | 'increase-quantity'
  | 'consider-removing'
  | 'add-missing-item';

export interface RuleProposal {
  /** Stable across runs so a dismissal sticks. */
  id: string;
  kind: ProposalKind;
  itemId?: string;
  title: string;
  /** The evidence. Always names the trips. */
  rationale: string;
  /** Null when there is no defensible automatic edit. */
  apply: ((library: Library) => Library) | null;
  before?: string;
  after?: string;
}

interface Observation {
  trip: Trip;
  facts: TripFacts;
  outcome: ReviewOutcome;
  note?: string;
}

function observationsByItem(library: Library, trips: Trip[]): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const trip of trips) {
    if (!trip.review?.completedISO) continue;
    const facts = deriveFacts(trip, library);
    for (const entry of trip.review.entries) {
      if (!entry.itemId) continue;
      const list = map.get(entry.itemId) ?? [];
      list.push({ trip, facts, outcome: entry.outcome, note: entry.note });
      map.set(entry.itemId, list);
    }
  }
  return map;
}

/** The first numeric condition in a rule, and where it sits. */
function firstNumeric(item: Item): { cond: NumericCond; index: number } | null {
  for (let i = 0; i < item.rule.conds.length; i += 1) {
    const cond = item.rule.conds[i]!;
    if (cond.kind === 'numeric') return { cond, index: i };
  }
  return null;
}

function factValue(field: NumericCond['field'], facts: TripFacts): number {
  switch (field) {
    case 'nights':
      return facts.nights;
    case 'days':
      return facts.days;
    case 'people':
      return facts.people;
    case 'driveHours':
      return facts.driveHours;
    case 'overnightLow':
      return facts.overnightLow;
    case 'daytimeHigh':
      return facts.daytimeHigh;
    case 'windKph':
      return facts.windKph;
  }
}

function replaceNumeric(item: Item, index: number, value: number): Item {
  const conds = [...item.rule.conds];
  const existing = conds[index]!;
  if (existing.kind !== 'numeric') return item;
  conds[index] = { ...existing, value };
  return { ...item, rule: { ...item.rule, conds: conds as typeof item.rule.conds } };
}

const tripList = (observations: Observation[]) =>
  observations.map((o) => o.trip.name).join(', ');

export function proposalsFrom(library: Library, trips: Trip[]): RuleProposal[] {
  const names = namesFrom(library);
  const byItem = observationsByItem(library, trips);
  const proposals: RuleProposal[] = [];

  for (const item of library.items) {
    const observations = byItem.get(item.id) ?? [];
    if (observations.length === 0) continue;

    const unused = observations.filter((o) => o.outcome === 'unused');
    const used = observations.filter((o) => o.outcome === 'used');
    const missing = observations.filter((o) => o.outcome === 'missing');
    const broke = observations.filter((o) => o.outcome === 'broke');
    const tooMuch = observations.filter((o) => o.outcome === 'too-much');
    const notEnough = observations.filter((o) => o.outcome === 'not-enough');

    // --- packed and never touched, more than once, never used ------------
    if (unused.length >= 2 && used.length === 0) {
      const numeric = firstNumeric(item);
      if (numeric) {
        const observed = unused.map((o) => factValue(numeric.cond.field, o.facts));
        // Move the threshold just past every trip where it went unused, so the
        // same trips would no longer have packed it.
        const next =
          numeric.cond.op === 'atLeast'
            ? Math.max(...observed) + 1
            : numeric.cond.op === 'atMost'
              ? Math.min(...observed) - 1
              : null;

        // The threshold is already past every unused trip: the evidence has
        // been acted on, so there is nothing to propose. Falling through to the
        // advisory here would nag about a decision already made.
        if (next !== null && next === numeric.cond.value) continue;

        if (next !== null) {
          const after = replaceNumeric(item, numeric.index, next);
          proposals.push({
            id: `tighten:${item.id}:${numeric.cond.field}:${next}`,
            kind: 'tighten-threshold',
            itemId: item.id,
            title: `Raise the threshold on ${item.name}?`,
            rationale: `Packed and never touched on ${unused.length} trips (${tripList(unused)}). On those trips ${numeric.cond.field} was ${observed.join(', ')}. Moving the threshold to ${next} would have left it at home.`,
            before: ruleToEnglish(item.rule, names),
            after: ruleToEnglish(after.rule, names),
            apply: (lib) => upsertItem(lib, after),
          });
          continue;
        }
      }

      proposals.push({
        id: `remove:${item.id}:${unused.length}`,
        kind: 'consider-removing',
        itemId: item.id,
        title: `${item.name} has never been used`,
        rationale: `Packed and never touched on ${unused.length} trips (${tripList(unused)}), and never reported as used. Its rule has no threshold to move, so this needs a decision rather than an edit: add a condition, or take it out of the library.`,
        before: ruleToEnglish(item.rule, names),
        apply: null,
      });
    }

    // --- wanted it, did not have it --------------------------------------
    if (missing.length >= 1) {
      const numeric = firstNumeric(item);
      if (numeric) {
        const observed = missing.map((o) => factValue(numeric.cond.field, o.facts));
        const next =
          numeric.cond.op === 'atLeast'
            ? Math.min(...observed)
            : numeric.cond.op === 'atMost'
              ? Math.max(...observed)
              : null;

        if (next !== null && next !== numeric.cond.value) {
          const after = replaceNumeric(item, numeric.index, next);
          proposals.push({
            id: `loosen:${item.id}:${numeric.cond.field}:${next}`,
            kind: 'loosen-threshold',
            itemId: item.id,
            title: `Loosen the threshold on ${item.name}?`,
            rationale: `Wanted on ${missing.length} trip${missing.length === 1 ? '' : 's'} (${tripList(missing)}) where ${numeric.cond.field} was ${observed.join(', ')}. Moving the threshold to ${next} would have packed it.`,
            before: ruleToEnglish(item.rule, names),
            after: ruleToEnglish(after.rule, names),
            apply: (lib) => upsertItem(lib, after),
          });
        }
      } else {
        proposals.push({
          id: `missing-nothreshold:${item.id}:${missing.length}`,
          kind: 'consider-removing',
          itemId: item.id,
          title: `${item.name} was wanted but did not pack`,
          rationale: `Missing on ${tripList(missing)}. Its rule has no threshold to loosen — look at which condition kept it at home.`,
          before: ruleToEnglish(item.rule, names),
          apply: null,
        });
      }
    }

    // --- it broke ---------------------------------------------------------
    if (broke.length >= 1 && item.gear?.condition !== 'needs-repair' && item.gear?.condition !== 'retired') {
      const after: Item = {
        ...item,
        gear: { ...item.gear, condition: 'needs-repair' },
      };
      proposals.push({
        id: `broke:${item.id}:${broke.length}`,
        kind: 'mark-needs-repair',
        itemId: item.id,
        title: `Mark ${item.name} as needing repair`,
        rationale: `Reported broken on ${tripList(broke)}. It still packs — marking it puts it on the T-3 days gear check and warns on the list until it is fixed.`,
        apply: (lib) => upsertItem(lib, after),
      });
    }

    // --- quantities -------------------------------------------------------
    if (tooMuch.length >= 2 && item.qty.rate > 0) {
      const rate = Math.round(item.qty.rate * 0.75 * 100) / 100;
      if (rate !== item.qty.rate) {
        const after: Item = { ...item, qty: { ...item.qty, rate } };
        proposals.push({
          id: `less:${item.id}:${rate}`,
          kind: 'reduce-quantity',
          itemId: item.id,
          title: `Bring less ${item.name}?`,
          rationale: `Too much on ${tooMuch.length} trips (${tripList(tooMuch)}). Dropping the rate from ${item.qty.rate} to ${rate} per ${item.qty.unit.replace(/^per/, '').toLowerCase()} is a quarter less.`,
          before: `${item.qty.base} + ${item.qty.rate} ${item.qty.unit}`,
          after: `${item.qty.base} + ${rate} ${item.qty.unit}`,
          apply: (lib) => upsertItem(lib, after),
        });
      }
    }

    if (notEnough.length >= 1) {
      const rate = item.qty.rate > 0 ? Math.round(item.qty.rate * 1.25 * 100) / 100 : item.qty.rate;
      const base = item.qty.rate > 0 ? item.qty.base : item.qty.base + 1;
      const after: Item = { ...item, qty: { ...item.qty, rate, base } };
      proposals.push({
        id: `more:${item.id}:${rate}:${base}`,
        kind: 'increase-quantity',
        itemId: item.id,
        title: `Bring more ${item.name}?`,
        rationale: `Ran out on ${tripList(notEnough)}. Running out of a consumable at camp is the failure this is meant to prevent.`,
        before: `${item.qty.base} + ${item.qty.rate} ${item.qty.unit}`,
        after: `${base} + ${rate} ${item.qty.unit}`,
        apply: (lib) => upsertItem(lib, after),
      });
    }
  }

  // --- things that were not in the library at all -------------------------
  const missingNames = new Map<string, string[]>();
  for (const trip of trips) {
    if (!trip.review?.completedISO) continue;
    for (const entry of trip.review.entries) {
      if (!entry.missingName) continue;
      const name = entry.missingName.trim();
      if (!name) continue;
      missingNames.set(name, [...(missingNames.get(name) ?? []), trip.name]);
    }
  }
  for (const [name, tripNames] of missingNames) {
    proposals.push({
      id: `add:${name.toLowerCase()}`,
      kind: 'add-missing-item',
      title: `Add "${name}" to the library?`,
      rationale: `Wanted on ${tripNames.join(', ')} and not in the library at all. Pack Out will not invent a rule for it — decide what it depends on and add it.`,
      apply: null,
    });
  }

  return proposals.filter((p) => !library.dismissedProposals.includes(p.id));
}

export function dismissProposal(library: Library, proposalId: string): Library {
  return { ...library, dismissedProposals: [...library.dismissedProposals, proposalId] };
}

export function undismissAll(library: Library): Library {
  return { ...library, dismissedProposals: [] };
}

// ---------------------------------------------------------------------------
// Capturing a review
// ---------------------------------------------------------------------------

export interface ReviewCandidate {
  itemId: string;
  name: string;
  container: string;
  kind: Item['kind'];
  outcome?: ReviewOutcome;
  note?: string;
}

/**
 * What to ask about. Everything that actually packed, so the review is against
 * the list you took rather than the whole library.
 */
export function reviewCandidates(trip: Trip, library: Library): ReviewCandidate[] {
  const result = buildList(trip, library);
  const seen = new Set<string>();
  const candidates: ReviewCandidate[] = [];

  for (const line of result.lines) {
    if (line.item.type === 'action') continue;
    if (line.item.id.startsWith('ingredient:')) continue;
    if (seen.has(line.item.id)) continue;
    seen.add(line.item.id);

    const entry = trip.review?.entries.find((e) => e.itemId === line.item.id);
    candidates.push({
      itemId: line.item.id,
      name: line.item.name,
      container: line.item.container,
      kind: line.item.kind,
      outcome: entry?.outcome,
      note: entry?.note,
    });
  }

  return candidates.sort((a, b) => a.container.localeCompare(b.container) || a.name.localeCompare(b.name));
}

export function setOutcome(trip: Trip, itemId: string, outcome: ReviewOutcome | null): Trip {
  const entries = trip.review.entries.filter((e) => e.itemId !== itemId);
  return {
    ...trip,
    review: {
      ...trip.review,
      entries: outcome ? [...entries, { itemId, outcome }] : entries,
    },
  };
}

export function addMissing(trip: Trip, name: string): Trip {
  if (!name.trim()) return trip;
  return {
    ...trip,
    review: {
      ...trip.review,
      entries: [...trip.review.entries, { missingName: name.trim(), outcome: 'missing' }],
    },
  };
}

export interface ReviewProgress {
  answered: number;
  total: number;
  complete: boolean;
}

export function reviewProgress(candidates: ReviewCandidate[], trip: Trip): ReviewProgress {
  const answered = candidates.filter((c) => c.outcome).length;
  return {
    answered,
    total: candidates.length,
    complete: Boolean(trip.review.completedISO),
  };
}
