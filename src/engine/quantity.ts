import type { Person, Qty, QtyUnit } from '../data/types';
import { eaterUnitsFor, type TripFacts } from './facts';

export interface QtyTrace {
  value: number;
  /** Plain-language arithmetic, e.g. "1 + 2 x 3 nights = 7, capped at 6". */
  english: string;
  unitCount: number;
}

/**
 * How many of the unit this trip has.
 * Inside a per-person expansion the person units collapse to that one person,
 * so a "2 per person" item issued per-person is 2 for each line, not 2 x N.
 */
export function unitCount(unit: QtyUnit, facts: TripFacts, subject?: Person): number {
  switch (unit) {
    case 'flat':
      return 0;
    case 'perNight':
      return facts.nights;
    case 'perDay':
      return facts.days;
    case 'perPerson':
      return subject ? 1 : facts.people;
    case 'perAdult':
      return subject ? (subject.role === 'adult' ? 1 : 0) : facts.adults;
    case 'perKid':
      return subject ? (subject.role === 'kid' ? 1 : 0) : facts.kids;
    case 'perPersonDay':
      return (subject ? 1 : facts.people) * facts.days;
    case 'perShelter':
      return facts.shelterCount;
  }
}

const UNIT_NOUN: Record<QtyUnit, string> = {
  flat: '',
  perNight: 'nights',
  perDay: 'days',
  perPerson: 'people',
  perAdult: 'adults',
  perKid: 'kids',
  perPersonDay: 'person-days',
  perShelter: 'shelters',
};

/**
 * value = base + rate x unitCount, rounded UP, then capped, never below zero.
 *
 * Rounding up before capping is deliberate: you cannot pack 2.4 fuel canisters,
 * and a cap is a statement about the most you would ever carry, so it has to be
 * applied to the number you would actually pack.
 */
export function evalQuantity(qty: Qty, facts: TripFacts, subject?: Person): QtyTrace {
  const count = unitCount(qty.unit, facts, subject);
  const raw = qty.base + qty.rate * count;
  const rounded = Math.max(0, Math.ceil(roundFloat(raw)));
  const capped = qty.cap !== undefined ? Math.min(rounded, qty.cap) : rounded;

  const parts: string[] = [];
  if (qty.unit === 'flat' || qty.rate === 0) {
    parts.push(`${qty.base}`);
  } else {
    parts.push(`${qty.base} + ${qty.rate} x ${count} ${UNIT_NOUN[qty.unit]} = ${roundFloat(raw)}`);
    if (rounded !== roundFloat(raw)) parts.push(`rounded up to ${rounded}`);
  }
  if (capped !== rounded) parts.push(`capped at ${qty.cap}`);

  return { value: capped, english: parts.join(', '), unitCount: count };
}

/** Kills float noise like 2.0999999999999996 before it reaches a ceil(). */
function roundFloat(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Food scales by appetite, not headcount. */
export function eaterUnitsPresent(facts: TripFacts): number {
  return facts.attendees.reduce((sum, p) => sum + eaterUnitsFor(p), 0);
}
