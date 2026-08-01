import type { Library, Trip } from '../data/types';
import type { TripFacts } from './facts';
import type { IngredientLine, PlannedMeal, TripDay } from './meals';
import { emptySlots } from './meals';

/**
 * The judgement a cook would exercise over a meal plan.
 *
 * These are not style notes. Each one names a specific way a real trip goes
 * wrong: arriving at dusk to a two-pot meal, foil packets in horizontal rain,
 * chicken on day four out of a cooler that gave up on day three.
 */
export type FoodSeverity = 'error' | 'warn' | 'note';

export interface FoodWarning {
  id: string;
  severity: FoodSeverity;
  title: string;
  detail: string;
  /** What to do about it, when there is an obvious answer. */
  fix?: string;
}

/** Coolers lose the fight around here, with real ice and a real family opening it. */
export const COOLER_RELIABLE_DAYS = 3;

export function foodWarnings(
  trip: Trip,
  library: Library,
  facts: TripFacts,
  planned: PlannedMeal[],
  lines: IngredientLine[],
  days: TripDay[],
): FoodWarning[] {
  const warnings: FoodWarning[] = [];
  const dinners = planned.filter((p) => p.entry.slot === 'dinner');

  // --- allergies and diets ------------------------------------------------
  const attendees = library.people.filter((p) => trip.attendeeIds.includes(p.id));
  for (const person of attendees) {
    for (const allergy of person.allergies ?? []) {
      const hits = lines.filter((line) =>
        (line.ingredient.allergens ?? []).some((a) => a.toLowerCase() === allergy.toLowerCase()),
      );
      if (hits.length === 0) continue;
      warnings.push({
        id: `allergy-${person.id}-${allergy}`,
        severity: 'error',
        title: `${person.name} is allergic to ${allergy}, and the plan contains it`,
        detail: hits.map((h) => h.ingredient.name).join(', '),
        fix: 'Swap the meal or the ingredient. This is flagged on the shopping list too.',
      });
    }
  }

  // --- cold chain ---------------------------------------------------------
  const lateCold = lines.filter(
    (line) => line.cold === 'refrigerated' && line.firstDayIndex >= COOLER_RELIABLE_DAYS,
  );
  if (lateCold.length > 0) {
    warnings.push({
      id: 'cold-chain-late',
      severity: 'warn',
      title: `Refrigerated food scheduled after day ${COOLER_RELIABLE_DAYS}`,
      detail: lateCold
        .map((l) => `${l.ingredient.name} (day ${l.firstDayIndex + 1})`)
        .join(', '),
      fix: `Coolers stop holding 4 °C around day ${COOLER_RELIABLE_DAYS}. Move these earlier, buy them en route, or put an ice re-supply on the timeline.`,
    });
  }

  const frozen = lines.filter((l) => l.cold === 'frozen');
  if (frozen.length > 0) {
    warnings.push({
      id: 'frozen-is-ice',
      severity: 'note',
      title: `${frozen.length} frozen item${frozen.length === 1 ? '' : 's'} doubling as ice`,
      detail: frozen.map((l) => l.ingredient.name).join(', '),
      fix: 'These go in at the bottom. Load them frozen solid, not merely cold.',
    });
  }

  // --- complexity budget --------------------------------------------------
  // Every dinner on arrival night, not just the first: adding a second, harder
  // meal alongside a simple one is exactly the mistake worth catching.
  const arrivalDinners = dinners.filter((p) => p.day.isArrivalDay);
  const hardArrival = arrivalDinners.filter((p) => p.meal.pots > 1 || p.meal.project);
  if (hardArrival.length > 0) {
    const totalPots = arrivalDinners.reduce((sum, p) => sum + p.meal.pots, 0);
    warnings.push({
      id: 'arrival-complexity',
      severity: 'warn',
      title: `Arrival night is ${arrivalDinners.map((p) => p.meal.name).join(' and ')}`,
      detail:
        `${totalPots} pot${totalPots === 1 ? '' : 's'} in total` +
        `${hardArrival.some((p) => p.meal.project) ? ', including a project meal' : ''}.`,
      fix: 'Arrival night must be trivial. You will be setting up in the dark with hungry kids. Move this to day two and put something one-pot here.',
    });
  }
  if (arrivalDinners.length === 0 && days.length > 0) {
    warnings.push({
      id: 'no-arrival-dinner',
      severity: 'warn',
      title: 'Nothing planned for arrival night',
      detail: 'The first dinner is the one you least want to improvise.',
    });
  }

  const projects = planned.filter((p) => p.meal.project);
  if (projects.length > 1) {
    warnings.push({
      id: 'too-many-projects',
      severity: 'warn',
      title: `${projects.length} project meals planned`,
      detail: projects.map((p) => `${p.day.label}: ${p.meal.name}`).join(' · '),
      fix: 'One per trip. The second one is the one that does not happen.',
    });
  }

  // --- weather contingency ------------------------------------------------
  const wet = ['rain', 'heavy', 'snow'].includes(facts.precip);
  if (wet && planned.length > 0) {
    const survivable = planned.filter((p) => p.meal.noCook || (p.meal.pots <= 1 && !p.meal.needsFire));
    if (survivable.length === 0) {
      warnings.push({
        id: 'no-wet-weather-meal',
        severity: 'warn',
        title: `Forecast is ${facts.precip}, and nothing on the plan survives it`,
        detail: 'Every meal needs either a fire or more than one pot.',
        fix: 'Add at least one no-cook or one-pot meal. Cooking a complicated dinner under a tarp in the rain is how a trip turns.',
      });
    }
  }

  const fireDinners = dinners.filter((p) => p.meal.needsFire);
  if (dinners.length > 0 && fireDinners.length === dinners.length) {
    warnings.push({
      id: 'all-dinners-need-fire',
      severity: 'warn',
      title: 'Every dinner needs a fire',
      detail: fireDinners.map((p) => p.meal.name).join(', '),
      fix: 'A category 1 ban or a wet evening takes out your whole dinner plan at once. Keep one stove meal.',
    });
  }
  if (fireDinners.length > 0 && !facts.site.picnicTableAndFireRing) {
    warnings.push({
      id: 'fire-meal-no-fire-ring',
      severity: 'warn',
      title: 'A fire meal is planned, but the site has no fire ring',
      detail: fireDinners.map((p) => p.meal.name).join(', '),
      fix: 'Answer the site questionnaire, or plan a stove meal instead.',
    });
  }

  // --- leftovers ----------------------------------------------------------
  for (const p of planned) {
    if (p.meal.id !== 'meal-leftovers') continue;
    if (p.leftoversFrom) {
      if (!p.leftoversFrom.meal.producesLeftovers) {
        warnings.push({
          id: `leftovers-thin-${p.entry.id}`,
          severity: 'note',
          title: `${p.day.label}: leftovers from ${p.leftoversFrom.meal.name}`,
          detail: 'That meal is not marked as producing leftovers, so this may be optimistic.',
        });
      }
      if (p.leftoversFrom.day.dayIndex >= p.day.dayIndex) {
        warnings.push({
          id: `leftovers-order-${p.entry.id}`,
          severity: 'error',
          title: `${p.day.label}: leftovers from a meal that has not happened yet`,
          detail: `Source is ${p.leftoversFrom.day.label}.`,
          fix: 'Point it at an earlier meal.',
        });
      }
    } else {
      warnings.push({
        id: `leftovers-unlinked-${p.entry.id}`,
        severity: 'warn',
        title: `${p.day.label} ${p.entry.slot}: leftovers with no source`,
        detail: 'Nothing on the shopping list accounts for this meal.',
        fix: 'Link it to the dinner that produces it, or plan something else.',
      });
    }
  }

  // --- gaps ---------------------------------------------------------------
  const gaps = emptySlots(days, planned);
  if (gaps.length > 0) {
    warnings.push({
      id: 'empty-slots',
      severity: 'note',
      title: `${gaps.length} meal slot${gaps.length === 1 ? '' : 's'} with nothing planned`,
      detail: gaps.map((g) => `${g.day.label} ${g.slot}`).join(' · '),
    });
  }

  return warnings;
}
