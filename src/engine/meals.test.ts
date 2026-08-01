import { describe, expect, it } from 'vitest';
import {
  coolerOrder,
  cookingWaterL,
  emptySlots,
  generatedPrepTasks,
  ingredientLines,
  mealRequirements,
  plannedMeals,
  scaledAmount,
  tripDays,
} from './meals';
import { shoppingList, toBuyCount, shoppingListToText } from './shopping';
import { foodWarnings, COOLER_RELIABLE_DAYS } from './foodWarnings';
import { deriveFacts } from './facts';
import { buildList } from './build';
import { defaultLibrary } from '../data/library';
import {
  FAMILY_CAR_SUMMER,
  NOBODY,
  SOLO_BACKCOUNTRY_SHOULDER,
  ZERO_NIGHTS,
} from '../data/fixtures';
import { migrate, SCHEMA_VERSION } from '../data/schema';
import type { Ingredient, Library, Trip } from '../data/types';

const library = defaultLibrary();
const facts = deriveFacts(FAMILY_CAR_SUMMER, library);
const days = tripDays(FAMILY_CAR_SUMMER, facts);
const planned = plannedMeals(FAMILY_CAR_SUMMER, library, facts);
const lines = ingredientLines(planned, facts, library);

const ing = (overrides: Partial<Ingredient>): Ingredient => ({
  id: 'x',
  name: 'X',
  amount: 100,
  unit: 'g',
  scaling: 'per-eater',
  section: 'dry-goods',
  cold: 'ambient',
  ...overrides,
});

describe('trip days — meals are planned against real dates', () => {
  it('produces one day per day of the trip', () => {
    expect(days).toHaveLength(4); // 3 nights
  });

  it('labels days with a real weekday and date, not "day two"', () => {
    expect(days[0]!.label).toBe('Day 1 · Fri 10 Jul');
    expect(days[3]!.label).toBe('Day 4 · Mon 13 Jul');
  });

  it('marks the arrival and departure days', () => {
    expect(days[0]!.isArrivalDay).toBe(true);
    expect(days[3]!.isDepartureDay).toBe(true);
    expect(days[1]!.isArrivalDay).toBe(false);
  });

  it('has no days at all for a zero-night trip', () => {
    expect(tripDays(ZERO_NIGHTS, deriveFacts(ZERO_NIGHTS, library))).toEqual([]);
  });
});

describe('planned meals', () => {
  it('resolves every entry to a meal and a dated day', () => {
    expect(planned).toHaveLength(9);
    expect(planned[0]!.meal.name).toBe('Chili, frozen flat');
    expect(planned[0]!.day.dayIndex).toBe(0);
  });

  it('sorts by day, then by time of day rather than alphabetically', () => {
    expect(planned.map((p) => `${p.day.dayIndex} ${p.entry.slot}`)).toEqual([
      '0 dinner',
      '1 breakfast',
      '1 lunch',
      '1 dinner',
      '1 snack',
      '2 breakfast',
      '2 lunch',
      '2 dinner',
      '3 breakfast',
    ]);
  });

  it('resolves a leftovers entry to the meal that produced it', () => {
    const leftovers = planned.find((p) => p.meal.id === 'meal-leftovers')!;
    expect(leftovers.leftoversFrom?.meal.name).toBe('Chili, frozen flat');
  });

  it('drops entries scheduled past the end of a shortened trip rather than throwing', () => {
    const shortened: Trip = { ...FAMILY_CAR_SUMMER, endDate: '2026-07-11' };
    const shortPlan = plannedMeals(shortened, library, deriveFacts(shortened, library));
    expect(shortPlan.every((p) => p.day.dayIndex <= 1)).toBe(true);
    expect(shortPlan.length).toBeLessThan(planned.length);
  });

  it('ignores an entry pointing at a meal that was deleted', () => {
    const trip: Trip = {
      ...FAMILY_CAR_SUMMER,
      mealPlan: [{ id: 'x', dayIndex: 0, slot: 'dinner', mealId: 'meal-that-does-not-exist' }],
    };
    expect(plannedMeals(trip, library, deriveFacts(trip, library))).toEqual([]);
  });
});

describe('scaling by eater units, not headcount', () => {
  // 2 adults + 1 kid (0.7) + 1 toddler (0.5) = 3.2 eater units.
  it('scales a per-eater ingredient', () => {
    expect(facts.eaterUnits).toBeCloseTo(3.2, 5);
    expect(scaledAmount(ing({ amount: 100 }), facts.eaterUnits)).toBe(320);
  });

  it('leaves a flat ingredient alone — one jar of mustard feeds everybody', () => {
    expect(scaledAmount(ing({ amount: 1, unit: 'pack', scaling: 'flat' }), facts.eaterUnits)).toBe(1);
  });

  it('rounds whole units up, because you cannot buy 6.4 eggs', () => {
    expect(scaledAmount(ing({ amount: 2, unit: 'ea' }), facts.eaterUnits)).toBe(7);
  });

  it('does not round weights up to the nearest whole gram-count', () => {
    expect(scaledAmount(ing({ amount: 70 }), facts.eaterUnits)).toBe(224);
  });

  it('follows a per-person appetite override', () => {
    const hungry = structuredClone(library);
    hungry.people.find((p) => p.id === 'p-kid-1')!.appetite = 2;
    const f = deriveFacts(FAMILY_CAR_SUMMER, hungry);
    expect(scaledAmount(ing({ amount: 100 }), f.eaterUnits)).toBe(390); // 3.9 units
  });

  it('scales to nothing when nobody is going', () => {
    const f = deriveFacts(NOBODY, library);
    expect(scaledAmount(ing({ amount: 100 }), f.eaterUnits)).toBe(0);
  });
});

describe('the three categories a meal contributes', () => {
  const requirements = mealRequirements(planned);

  it('pulls in cooking instruments', () => {
    const cooking = requirements.filter((r) => r.role === 'cooking instrument');
    expect(cooking.map((r) => r.itemId)).toContain('frying-pan');
    expect(cooking.map((r) => r.itemId)).toContain('foil');
  });

  it('pulls in eating instruments', () => {
    const eating = requirements.filter((r) => r.role === 'eating instrument');
    expect(eating.map((r) => r.itemId)).toContain('bowls');
  });

  it('names the meals that need each one, for the why trace', () => {
    const pan = requirements.find((r) => r.itemId === 'frying-pan')!;
    expect(pan.reasons.length).toBeGreaterThan(0);
    expect(pan.reasons[0]).toMatch(/Day \d/);
  });

  it('lists each instrument once, however many meals need it', () => {
    const ids = requirements.filter((r) => r.role === 'cooking instrument').map((r) => r.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces ingredient lines as the third category', () => {
    expect(lines.length).toBeGreaterThan(15);
    expect(lines.some((l) => l.ingredient.name === 'Eggs')).toBe(true);
  });

  it('aggregates the same ingredient across meals into one line', () => {
    const cheese = lines.filter((l) => l.ingredient.name === 'Grated cheese');
    expect(cheese).toHaveLength(1);
    // Chili (30 g) and tacos (40 g) per eater unit, at 3.2 units.
    expect(cheese[0]!.amount).toBeCloseTo(224, 1);
    expect(cheese[0]!.meals.length).toBe(2);
  });

  it('records the earliest day an ingredient is needed', () => {
    const chili = lines.find((l) => l.ingredient.name === 'Chili (made at home)')!;
    expect(chili.firstDayIndex).toBe(0);
  });
});

describe('the meal plan reaching the packing list', () => {
  const contribution = {
    requiredItems: mealRequirements(planned).map((r) => ({
      itemId: r.itemId,
      reasons: r.reasons,
      role: r.role as string,
    })),
    ingredients: lines.map((l) => ({
      key: l.key,
      name: l.ingredient.name,
      amount: `${l.amount} ${l.ingredient.unit}`,
      cold: l.cold,
      meals: l.meals,
    })),
  };

  it('adds the ingredients to the list', () => {
    const result = buildList(FAMILY_CAR_SUMMER, library, contribution);
    expect(result.lines.some((l) => l.item.name.startsWith('Eggs'))).toBe(true);
  });

  it('files chilled ingredients in the cooler and ambient ones in the pantry box', () => {
    const result = buildList(FAMILY_CAR_SUMMER, library, contribution);
    const eggs = result.lines.find((l) => l.item.name.startsWith('Eggs'))!;
    const oats = result.lines.find((l) => l.item.name.startsWith('Dried pasta'));
    expect(eggs.item.container).toBe('cooler');
    if (oats) expect(oats.item.container).toBe('pantry-box');
  });

  it('marks ingredients scented, so bear storage catches them', () => {
    const result = buildList(FAMILY_CAR_SUMMER, library, contribution);
    const food = result.lines.filter((l) => l.item.id.startsWith('ingredient:'));
    expect(food.every((l) => l.item.scented)).toBe(true);
  });

  it('every meal-driven line still explains itself', () => {
    const result = buildList(FAMILY_CAR_SUMMER, library, contribution);
    const food = result.lines.filter((l) => l.item.id.startsWith('ingredient:'));
    expect(food.every((l) => l.why.english.length > 0 && l.why.conds.length > 0)).toBe(true);
  });

  it('pulls in an instrument no rule would have packed', () => {
    // Foil is vehicle-only by rule; on a carried trip the meal plan is the
    // only thing that could put it there.
    const carried: Trip = {
      ...SOLO_BACKCOUNTRY_SHOULDER,
      mealPlan: [{ id: 'm1', dayIndex: 0, slot: 'dinner', mealId: 'meal-foil-salmon' }],
    };
    const f = deriveFacts(carried, library);
    const p = plannedMeals(carried, library, f);
    const result = buildList(carried, library, {
      requiredItems: mealRequirements(p).map((r) => ({ ...r, role: r.role as string })),
      ingredients: [],
    });
    const foil = result.lines.find((l) => l.item.id === 'foil');
    expect(foil).toBeDefined();
    expect(foil!.why.english).toContain('meal plan');
  });

  it('changes nothing when no meal plan is passed', () => {
    const without = buildList(FAMILY_CAR_SUMMER, library);
    expect(without.lines.some((l) => l.item.id.startsWith('ingredient:'))).toBe(false);
  });
});

describe('cooler packing order', () => {
  const order = coolerOrder(lines);

  it('leaves ambient food out of the cooler entirely', () => {
    expect(order.every((l) => l.cold !== 'ambient')).toBe(true);
  });

  it('puts frozen items first — they go in at the bottom as the ice', () => {
    expect(order[0]!.cold).toBe('frozen');
  });

  it('puts the latest-eaten chilled food below the earliest', () => {
    const chilled = order.filter((l) => l.cold === 'refrigerated');
    for (let i = 1; i < chilled.length; i += 1) {
      expect(chilled[i - 1]!.firstDayIndex).toBeGreaterThanOrEqual(chilled[i]!.firstDayIndex);
    }
  });
});

describe('water for cooking and cleanup', () => {
  it('is counted, and is not the same as drinking water', () => {
    expect(cookingWaterL(planned, facts)).toBeGreaterThan(5);
  });

  it('is zero with nothing planned', () => {
    expect(cookingWaterL([], facts)).toBe(0);
  });
});

describe('prep-at-home tasks', () => {
  const prep = generatedPrepTasks(planned);

  it('is generated from the meal plan, not hand-maintained', () => {
    expect(prep.map((p) => p.task.name)).toContain('Freeze the chili flat');
    expect(prep.map((p) => p.task.name)).toContain('Crack and season the eggs into a bottle');
  });

  it('carries a phase, so it lands on the timeline', () => {
    expect(prep.every((p) => p.task.phase.length > 0)).toBe(true);
    const chili = prep.find((p) => p.task.name === 'Freeze the chili flat')!;
    expect(chili.task.phase).toBe('t-3-days');
  });

  it('does not repeat a job because a meal appears twice', () => {
    const doubled: Trip = {
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' },
        { id: 'b', dayIndex: 1, slot: 'dinner', mealId: 'meal-chili' },
      ],
    };
    const p = plannedMeals(doubled, library, deriveFacts(doubled, library));
    expect(generatedPrepTasks(p)).toHaveLength(1);
  });
});

describe('the shopping list is a different document', () => {
  const sections = shoppingList(lines, library, FAMILY_CAR_SUMMER.attendeeIds);

  it('groups by store section, not by container', () => {
    expect(sections.map((s) => s.section)).toContain('produce');
    expect(sections.map((s) => s.section)).toContain('dairy');
    // Ordered the way you walk a shop, not alphabetically.
    expect(sections[0]!.section).toBe('produce');
  });

  it('keeps pantry staples off the list while they are in stock', () => {
    const staples = sections.flatMap((s) => s.items).filter((i) => i.pantryInStock);
    expect(staples.map((i) => i.name).sort()).toEqual(['Mustard', 'Syrup', 'Taco seasoning']);
    expect(toBuyCount(sections)).toBeLessThan(sections.flatMap((s) => s.items).length);
  });

  it('puts a staple back on the list once it is out of stock', () => {
    const empty: Library = { ...library, pantry: { ...library.pantry, Mustard: false } };
    const emptyLines = ingredientLines(planned, facts, empty);
    const sections2 = shoppingList(emptyLines, empty, FAMILY_CAR_SUMMER.attendeeIds);
    const mustard = sections2.flatMap((s) => s.items).find((i) => i.name === 'Mustard')!;
    expect(mustard.pantryInStock).toBe(false);
    expect(toBuyCount(sections2)).toBe(toBuyCount(sections) + 1);
  });

  it('shows an amount with its unit', () => {
    const eggs = sections.flatMap((s) => s.items).find((i) => i.name === 'Eggs')!;
    expect(eggs.amount).toBe('7');
  });

  it('flags an allergen that clashes with somebody on the trip', () => {
    const allergic = structuredClone(library);
    allergic.people.find((p) => p.id === 'p-kid-2')!.allergies = ['nuts'];
    const withNuts = plannedMeals(
      { ...FAMILY_CAR_SUMMER, mealPlan: [{ id: 'a', dayIndex: 1, slot: 'snack', mealId: 'meal-trail-mix' }] },
      allergic,
      facts,
    );
    const nutLines = ingredientLines(withNuts, facts, allergic);
    const s = shoppingList(nutLines, allergic, FAMILY_CAR_SUMMER.attendeeIds);
    const mix = s.flatMap((x) => x.items).find((i) => i.name === 'Trail mix')!;
    expect(mix.conflicts).toEqual(['nuts']);
  });

  it('does not flag an allergen for somebody who is not going', () => {
    const allergic = structuredClone(library);
    allergic.people.find((p) => p.id === 'p-kid-2')!.allergies = ['nuts'];
    const s = shoppingList(lines, allergic, ['p-adult-1']);
    expect(s.flatMap((x) => x.items).every((i) => i.conflicts.length === 0)).toBe(true);
  });

  it('exports as text with the in-stock staples listed separately', () => {
    const text = shoppingListToText(sections);
    expect(text).toContain('SHOPPING LIST');
    expect(text).toContain('ALREADY IN THE PANTRY BOX');
  });
});

describe('food judgement', () => {
  const warn = (trip: Trip, lib: Library = library) => {
    const f = deriveFacts(trip, lib);
    const p = plannedMeals(trip, lib, f);
    const l = ingredientLines(p, f, lib);
    return foodWarnings(trip, lib, f, p, l, tripDays(trip, f));
  };

  it('accepts the family fixture without an error-level finding', () => {
    const found = warn(FAMILY_CAR_SUMMER);
    expect(found.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('warns when arrival night is not trivial', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [{ id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-curry' }],
    });
    const arrival = found.find((w) => w.id === 'arrival-complexity')!;
    expect(arrival.detail).toContain('2 pots');
    expect(arrival.fix).toContain('trivial');
  });

  it('accepts a one-pot arrival night', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [{ id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' }],
    });
    expect(found.some((w) => w.id === 'arrival-complexity')).toBe(false);
  });

  it('caps project meals at one per trip', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 1, slot: 'breakfast', mealId: 'meal-pancakes' },
        { id: 'b', dayIndex: 2, slot: 'dinner', mealId: 'meal-curry' },
      ],
    });
    expect(found.some((w) => w.id === 'too-many-projects')).toBe(true);
  });

  it('requires a no-cook or one-pot meal when it is going to rain', () => {
    const wet: Trip = {
      ...FAMILY_CAR_SUMMER,
      weather: { ...FAMILY_CAR_SUMMER.weather, precip: 'heavy' },
      mealPlan: [{ id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-foil-salmon' }],
    };
    expect(warn(wet).some((w) => w.id === 'no-wet-weather-meal')).toBe(true);
  });

  it('is satisfied by a single one-pot meal in the rain', () => {
    const wet: Trip = {
      ...FAMILY_CAR_SUMMER,
      weather: { ...FAMILY_CAR_SUMMER.weather, precip: 'heavy' },
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-foil-salmon' },
        { id: 'b', dayIndex: 1, slot: 'dinner', mealId: 'meal-pasta' },
      ],
    };
    expect(warn(wet).some((w) => w.id === 'no-wet-weather-meal')).toBe(false);
  });

  it('warns when every dinner needs a fire', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-hotdogs' },
        { id: 'b', dayIndex: 1, slot: 'dinner', mealId: 'meal-foil-salmon' },
      ],
    });
    expect(found.some((w) => w.id === 'all-dinners-need-fire')).toBe(true);
  });

  it('warns about a fire meal at a site with no fire ring', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      site: { ...FAMILY_CAR_SUMMER.site, picnicTableAndFireRing: false },
      mealPlan: [{ id: 'a', dayIndex: 1, slot: 'dinner', mealId: 'meal-foil-salmon' }],
    });
    expect(found.some((w) => w.id === 'fire-meal-no-fire-ring')).toBe(true);
  });

  it(`flags refrigerated food scheduled after day ${COOLER_RELIABLE_DAYS}`, () => {
    const long: Trip = {
      ...FAMILY_CAR_SUMMER,
      endDate: '2026-07-17',
      mealPlan: [{ id: 'a', dayIndex: 5, slot: 'dinner', mealId: 'meal-burgers' }],
    };
    const found = warn(long);
    const cold = found.find((w) => w.id === 'cold-chain-late')!;
    expect(cold.detail).toContain('Burger patties');
    expect(cold.fix).toContain('ice re-supply');
  });

  it('does not flag refrigerated food eaten on day one', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [{ id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-burgers' }],
    });
    expect(found.some((w) => w.id === 'cold-chain-late')).toBe(false);
  });

  it('notes which frozen items are doing the work of ice', () => {
    const found = warn(FAMILY_CAR_SUMMER);
    expect(found.find((w) => w.id === 'frozen-is-ice')!.detail).toContain('Chili');
  });

  it('warns about a leftovers meal with no source', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' },
        { id: 'b', dayIndex: 1, slot: 'lunch', mealId: 'meal-leftovers' },
      ],
    });
    expect(found.some((w) => w.id === 'leftovers-unlinked-b')).toBe(true);
  });

  it('errors on leftovers from a meal that has not happened yet', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 2, slot: 'dinner', mealId: 'meal-chili' },
        { id: 'b', dayIndex: 1, slot: 'lunch', mealId: 'meal-leftovers', leftoversFrom: 'a' },
      ],
    });
    const bad = found.find((w) => w.id === 'leftovers-order-b')!;
    expect(bad.severity).toBe('error');
  });

  it('accepts leftovers linked to an earlier dinner that produces them', () => {
    const found = warn(FAMILY_CAR_SUMMER);
    expect(found.some((w) => w.id.startsWith('leftovers-'))).toBe(false);
  });

  it('raises an error when an ingredient clashes with an attendee allergy', () => {
    const allergic = structuredClone(library);
    allergic.people.find((p) => p.id === 'p-kid-1')!.allergies = ['fish'];
    const found = warn(FAMILY_CAR_SUMMER, allergic);
    const allergy = found.find((w) => w.id.startsWith('allergy-'))!;
    expect(allergy.severity).toBe('error');
    expect(allergy.detail).toContain('Salmon');
  });

  it('reports empty meal slots without pretending they are errors', () => {
    const found = warn({ ...FAMILY_CAR_SUMMER, mealPlan: [] });
    const gaps = found.find((w) => w.id === 'empty-slots')!;
    expect(gaps.severity).toBe('note');
  });

  it('does not ask for dinner on the departure day or breakfast on arrival', () => {
    const gaps = emptySlots(days, []);
    expect(gaps.some((g) => g.day.isDepartureDay && g.slot === 'dinner')).toBe(false);
    expect(gaps.some((g) => g.day.isArrivalDay && g.slot === 'breakfast')).toBe(false);
  });
});

describe('schema migration v1 to v2', () => {
  it('adds an empty meal plan to old trips', () => {
    const old = {
      schemaVersion: 1,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [] },
      trips: [{ id: 't1', name: 'Old trip' }],
    };
    const result = migrate<{ schemaVersion: number; library: Library; trips: Trip[] }>(old);
    expect(result.fromVersion).toBe(1);
    expect(result.applied).toHaveLength(1);
    expect(result.data.trips[0]!.mealPlan).toEqual([]);
  });

  it('gives an old library an EMPTY meal list, not the shipped defaults', () => {
    const old = {
      schemaVersion: 1,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [] },
      trips: [],
    };
    const result = migrate<{ schemaVersion: number; library: Library }>(old);
    // Injecting twenty meals into a curated library would be a worse surprise
    // than an empty meal screen.
    expect(result.data.library.meals).toEqual([]);
    expect(result.data.library.pantry).toEqual({});
  });

  it('stamps the result at the current version', () => {
    const result = migrate<{ schemaVersion: number }>({ schemaVersion: 1, library: {} });
    expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('leaves current-version data untouched', () => {
    const result = migrate<{ schemaVersion: number; library: Library }>({
      schemaVersion: SCHEMA_VERSION,
      library: structuredClone(library),
    });
    expect(result.applied).toEqual([]);
    expect(result.data.library.meals.length).toBeGreaterThan(0);
  });
});

describe('arrival night looks at every dinner, not just the first', () => {
  const warn = (trip: Trip) => {
    const f = deriveFacts(trip, library);
    const p = plannedMeals(trip, library, f);
    return foodWarnings(trip, library, f, p, ingredientLines(p, f, library), tripDays(trip, f));
  };

  it('catches a hard meal added alongside a simple one on arrival night', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' },
        { id: 'b', dayIndex: 0, slot: 'dinner', mealId: 'meal-curry' },
      ],
    });
    const arrival = found.find((w) => w.id === 'arrival-complexity')!;
    expect(arrival).toBeDefined();
    expect(arrival.title).toContain('Curry');
    expect(arrival.detail).toContain('3 pots in total');
  });

  it('still accepts two genuinely simple arrival dinners', () => {
    const found = warn({
      ...FAMILY_CAR_SUMMER,
      mealPlan: [
        { id: 'a', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' },
        { id: 'b', dayIndex: 0, slot: 'dinner', mealId: 'meal-hotdogs' },
      ],
    });
    expect(found.some((w) => w.id === 'arrival-complexity')).toBe(false);
  });
});
