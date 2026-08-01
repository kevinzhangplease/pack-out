import type {
  ColdChain,
  Id,
  Ingredient,
  Library,
  Meal,
  MealPlanEntry,
  MealSlot,
  PrepTask,
  Trip,
} from '../data/types';
import { MEAL_SLOTS } from '../data/types';
import type { TripFacts } from './facts';

/**
 * The meal plan is per meal, per day, against the real dates. "Day 2 breakfast"
 * is a different thing from "two breakfasts": it has a date, a temperature, a
 * position in the cooler and a place in the prep schedule.
 */

export interface TripDay {
  dayIndex: number;
  dateISO: string;
  /** "Day 2 · Sat 11 Jul" */
  label: string;
  isArrivalDay: boolean;
  isDepartureDay: boolean;
}

export interface PlannedMeal {
  entry: MealPlanEntry;
  meal: Meal;
  day: TripDay;
  /** Resolved source for a leftovers entry, if there is one. */
  leftoversFrom?: PlannedMeal;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function tripDays(trip: Trip, facts: TripFacts): TripDay[] {
  const start = Date.parse(`${trip.startDate}T00:00:00Z`);
  if (Number.isNaN(start) || facts.days === 0) return [];

  return Array.from({ length: facts.days }, (_, dayIndex) => {
    const date = new Date(start + dayIndex * 86_400_000);
    const dateISO = date.toISOString().slice(0, 10);
    const label =
      `Day ${dayIndex + 1} · ${DAY_NAMES[date.getUTCDay()]} ` +
      `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    return {
      dayIndex,
      dateISO,
      label,
      isArrivalDay: dayIndex === 0,
      isDepartureDay: dayIndex === facts.days - 1,
    };
  });
}

export function plannedMeals(trip: Trip, library: Library, facts: TripFacts): PlannedMeal[] {
  const days = tripDays(trip, facts);
  const byDayIndex = new Map(days.map((d) => [d.dayIndex, d]));

  const resolved: PlannedMeal[] = [];
  for (const entry of trip.mealPlan) {
    const meal = library.meals.find((m) => m.id === entry.mealId);
    const day = byDayIndex.get(entry.dayIndex);
    // A meal scheduled past the end of a shortened trip simply drops out
    // rather than throwing; the plan editor shows it as out of range.
    if (!meal || !day) continue;
    resolved.push({ entry, meal, day });
  }

  for (const planned of resolved) {
    if (!planned.entry.leftoversFrom) continue;
    planned.leftoversFrom = resolved.find((p) => p.entry.id === planned.entry.leftoversFrom);
  }

  return resolved.sort(
    (a, b) =>
      a.day.dayIndex - b.day.dayIndex ||
      MEAL_SLOTS.indexOf(a.entry.slot) - MEAL_SLOTS.indexOf(b.entry.slot),
  );
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/**
 * Ingredients scale by eater-units, not headcount: an adult is 1, a kid 0.7, a
 * toddler 0.5, with a per-person appetite override on top.
 */
export function scaledAmount(ingredient: Ingredient, eaterUnits: number): number {
  const raw = ingredient.scaling === 'flat' ? ingredient.amount : ingredient.amount * eaterUnits;
  // Whole-unit things round up — you cannot buy 2.8 eggs.
  const whole = ingredient.unit === 'ea' || ingredient.unit === 'pack';
  return whole ? Math.ceil(round(raw)) : round(raw);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatAmount(amount: number, unit: Ingredient['unit']): string {
  return unit === 'ea' ? `${amount}` : `${amount} ${unit}`;
}

// ---------------------------------------------------------------------------
// What the meal plan contributes to the packing list
// ---------------------------------------------------------------------------

export interface MealRequirement {
  itemId: Id;
  /** Which meals need it, for the "why is this here" trace. */
  reasons: string[];
  role: 'cooking instrument' | 'eating instrument';
}

/**
 * Cooking instruments and eating instruments. The third category — the
 * ingredients themselves — comes back from `ingredientLines`, because they are
 * not library items.
 */
export function mealRequirements(planned: PlannedMeal[]): MealRequirement[] {
  const map = new Map<string, MealRequirement>();

  const add = (itemId: Id, role: MealRequirement['role'], reason: string) => {
    const key = `${itemId}::${role}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      map.set(key, { itemId, role, reasons: [reason] });
    }
  };

  for (const p of planned) {
    const reason = `${p.day.label} ${p.entry.slot}: ${p.meal.name}`;
    p.meal.cookware.forEach((id) => add(id, 'cooking instrument', reason));
    p.meal.serveware.forEach((id) => add(id, 'eating instrument', reason));
  }

  return [...map.values()];
}

export interface IngredientLine {
  key: string;
  ingredient: Ingredient;
  amount: number;
  /** Earliest day this is eaten. Drives cooler order and cold-chain checks. */
  firstDayIndex: number;
  meals: string[];
  cold: ColdChain;
  inStock: boolean;
}

/**
 * Every ingredient the plan needs, aggregated across meals. Same ingredient in
 * two meals is one line with the amounts summed, because that is how you buy it
 * and how you pack it.
 */
export function ingredientLines(
  planned: PlannedMeal[],
  facts: TripFacts,
  library: Library,
): IngredientLine[] {
  const map = new Map<string, IngredientLine>();

  for (const p of planned) {
    const reason = `${p.day.label} ${p.entry.slot}`;
    for (const ingredient of p.meal.ingredients) {
      // Aggregate by name and unit: "Bread, ea" is one thing to buy.
      const key = `${ingredient.name.toLowerCase()}::${ingredient.unit}`;
      const amount = scaledAmount(ingredient, facts.eaterUnits);
      const existing = map.get(key);
      if (existing) {
        existing.amount = round(existing.amount + amount);
        existing.firstDayIndex = Math.min(existing.firstDayIndex, p.day.dayIndex);
        if (!existing.meals.includes(reason)) existing.meals.push(reason);
        // Frozen wins: if it goes in frozen for any meal, it travels frozen.
        if (ingredient.cold === 'frozen') existing.cold = 'frozen';
        else if (ingredient.cold === 'refrigerated' && existing.cold === 'ambient') {
          existing.cold = 'refrigerated';
        }
      } else {
        map.set(key, {
          key,
          ingredient,
          amount,
          firstDayIndex: p.day.dayIndex,
          meals: [reason],
          cold: ingredient.cold,
          inStock: ingredient.pantryStaple ? (library.pantry[ingredient.name] ?? false) : false,
        });
      }
    }
  }

  return [...map.values()];
}

/**
 * Cooler packing order: last-eaten at the bottom, frozen items underneath
 * everything as the ice. Ambient food is not in the cooler at all.
 */
export function coolerOrder(lines: IngredientLine[]): IngredientLine[] {
  return lines
    .filter((line) => line.cold !== 'ambient')
    .sort((a, b) => {
      // Frozen goes in first, so it is listed first: it is the ice.
      if (a.cold !== b.cold) return a.cold === 'frozen' ? -1 : 1;
      // Then latest day first — day-3 meals at the bottom.
      return b.firstDayIndex - a.firstDayIndex;
    });
}

/** Cooking and cleanup water, which is not the same as drinking water. */
export function cookingWaterL(planned: PlannedMeal[], facts: TripFacts): number {
  const total = planned.reduce((sum, p) => sum + p.meal.waterL * facts.eaterUnits, 0);
  return Math.round(total * 10) / 10;
}

// ---------------------------------------------------------------------------
// Prep tasks
// ---------------------------------------------------------------------------

export interface GeneratedPrep {
  key: string;
  task: PrepTask;
  meal: Meal;
  forDay: string;
}

/**
 * Prep-at-home tasks, generated from the meal plan and placed on the timeline.
 * The highest-leverage move in family car camping, and the one that is most
 * often left in somebody's head.
 */
export function generatedPrepTasks(planned: PlannedMeal[]): GeneratedPrep[] {
  const map = new Map<string, GeneratedPrep>();
  for (const p of planned) {
    for (const task of p.meal.prep) {
      // The same prep for two servings of a meal is one job.
      const key = `${p.meal.id}::${task.id}`;
      if (!map.has(key)) {
        map.set(key, { key, task, meal: p.meal, forDay: p.day.label });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.task.phase.localeCompare(b.task.phase));
}

/** Which slots on which days have nothing planned. */
export function emptySlots(
  days: TripDay[],
  planned: PlannedMeal[],
): { day: TripDay; slot: MealSlot }[] {
  const taken = new Set(planned.map((p) => `${p.day.dayIndex}::${p.entry.slot}`));
  const gaps: { day: TripDay; slot: MealSlot }[] = [];
  for (const day of days) {
    for (const slot of MEAL_SLOTS) {
      if (slot === 'snack') continue; // snacks are optional by nature
      // You arrive after lunch and leave after breakfast, most of the time.
      if (day.isArrivalDay && slot !== 'dinner') continue;
      if (day.isDepartureDay && slot === 'dinner') continue;
      if (!taken.has(`${day.dayIndex}::${slot}`)) gaps.push({ day, slot });
    }
  }
  return gaps;
}
