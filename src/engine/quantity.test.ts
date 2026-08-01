import { describe, expect, it } from 'vitest';
import { evalQuantity, unitCount } from './quantity';
import { deriveFacts } from './facts';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER, NOBODY, ZERO_NIGHTS } from '../data/fixtures';
import type { Qty } from '../data/types';

const library = defaultLibrary();
// 3 nights, 4 days, 4 people (2 adults, 1 kid, 1 toddler), 1 shelter.
const facts = deriveFacts(FAMILY_CAR_SUMMER, library);

const q = (partial: Partial<Qty>): Qty => ({ base: 0, rate: 0, unit: 'flat', ...partial });

describe('unitCount — every unit', () => {
  it.each([
    ['flat', 0],
    ['perNight', 3],
    ['perDay', 4],
    ['perPerson', 4],
    ['perAdult', 2],
    ['perKid', 1],
    ['perPersonDay', 16],
    ['perShelter', 1],
  ] as const)('%s -> %i', (unit, expected) => {
    expect(unitCount(unit, facts)).toBe(expected);
  });

  it('perKid counts only the kid role, not the toddler', () => {
    expect(facts.kids).toBe(1);
    expect(facts.toddlers).toBe(1);
    expect(unitCount('perKid', facts)).toBe(1);
  });
});

describe('unitCount — inside a per-person expansion', () => {
  const adult = library.people.find((p) => p.role === 'adult')!;
  const toddler = library.people.find((p) => p.role === 'toddler')!;

  it('person units collapse to one, so "2 per person" is 2 on each line', () => {
    expect(unitCount('perPerson', facts, adult)).toBe(1);
  });
  it('perAdult is one for an adult and zero for a toddler', () => {
    expect(unitCount('perAdult', facts, adult)).toBe(1);
    expect(unitCount('perAdult', facts, toddler)).toBe(0);
  });
  it('perPersonDay becomes that person days', () => {
    expect(unitCount('perPersonDay', facts, adult)).toBe(4);
  });
  it('night and day units are unaffected by the subject', () => {
    expect(unitCount('perNight', facts, adult)).toBe(3);
  });
});

describe('evalQuantity — the formula', () => {
  it('value = base + rate x unitCount', () => {
    expect(evalQuantity(q({ base: 1, rate: 1, unit: 'perNight' }), facts).value).toBe(4);
  });

  it('flat ignores the rate entirely', () => {
    expect(evalQuantity(q({ base: 2, rate: 99, unit: 'flat' }), facts).value).toBe(2);
  });

  it('rounds up — you cannot pack 2.4 fuel canisters', () => {
    expect(evalQuantity(q({ base: 1, rate: 0.5, unit: 'perNight' }), facts).value).toBe(3); // 2.5 -> 3
    expect(evalQuantity(q({ base: 0, rate: 0.34, unit: 'perDay' }), facts).value).toBe(2); // 1.36 -> 2
  });

  it('does not round a whole number up to the next one', () => {
    expect(evalQuantity(q({ base: 0, rate: 1, unit: 'perDay' }), facts).value).toBe(4);
  });

  it('survives float noise instead of ceiling it to a spurious extra unit', () => {
    // 0.1 + 0.2 style accumulation: 0.7 x 3 is 2.0999999999999996 in binary float.
    expect(evalQuantity(q({ base: 0, rate: 0.7, unit: 'perNight' }), facts).value).toBe(3);
    // 0.15 x 16 = 2.4000000000000004; must not become 4.
    expect(evalQuantity(q({ base: 0, rate: 0.15, unit: 'perPersonDay' }), facts).value).toBe(3);
  });

  it('caps after rounding, because the cap is about what you would carry', () => {
    expect(evalQuantity(q({ base: 1, rate: 0.5, unit: 'perNight', cap: 2 }), facts).value).toBe(2);
  });

  it('a cap above the computed value changes nothing', () => {
    expect(evalQuantity(q({ base: 1, rate: 1, unit: 'perNight', cap: 99 }), facts).value).toBe(4);
  });

  it('never goes below zero, even with a negative rate', () => {
    expect(evalQuantity(q({ base: 1, rate: -5, unit: 'perNight' }), facts).value).toBe(0);
  });

  it('a cap of zero means zero', () => {
    expect(evalQuantity(q({ base: 5, rate: 0, unit: 'flat', cap: 0 }), facts).value).toBe(0);
  });

  it('explains its own arithmetic', () => {
    const trace = evalQuantity(q({ base: 1, rate: 0.5, unit: 'perNight', cap: 2 }), facts);
    expect(trace.english).toContain('1 + 0.5 x 3 nights = 2.5');
    expect(trace.english).toContain('rounded up to 3');
    expect(trace.english).toContain('capped at 2');
  });
});

describe('evalQuantity — degenerate trips', () => {
  it('zero nights collapses per-night quantities to the base', () => {
    const f = deriveFacts(ZERO_NIGHTS, library);
    expect(evalQuantity(q({ base: 1, rate: 0.5, unit: 'perNight' }), f).value).toBe(1);
  });

  it('nobody going collapses per-person quantities to the base', () => {
    const f = deriveFacts(NOBODY, library);
    expect(evalQuantity(q({ base: 0, rate: 1, unit: 'perPerson' }), f).value).toBe(0);
    expect(evalQuantity(q({ base: 2, rate: 1, unit: 'perPerson' }), f).value).toBe(2);
  });

  it('no shelters means no per-shelter items', () => {
    const f = deriveFacts(NOBODY, library);
    expect(evalQuantity(q({ base: 0, rate: 1, unit: 'perShelter' }), f).value).toBe(0);
  });
});

describe('eater units — food scales by appetite, not headcount', () => {
  it('adult 1, kid 0.7, toddler 0.5', () => {
    expect(facts.eaterUnits).toBeCloseTo(1 + 1 + 0.7 + 0.5, 5);
  });

  it('a per-person appetite override applies', () => {
    const hungry = structuredClone(library);
    hungry.people.find((p) => p.id === 'p-kid-1')!.appetite = 1.5;
    const f = deriveFacts(FAMILY_CAR_SUMMER, hungry);
    expect(f.eaterUnits).toBeCloseTo(1 + 1 + 0.7 * 1.5 + 0.5, 5);
  });
});
