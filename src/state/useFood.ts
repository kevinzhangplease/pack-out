import { useMemo } from 'react';
import { useStore } from './store';
import { deriveFacts } from '../engine/facts';
import {
  coolerOrder,
  cookingWaterL,
  generatedPrepTasks,
  ingredientLines,
  mealRequirements,
  plannedMeals,
  tripDays,
} from '../engine/meals';
import { shoppingList } from '../engine/shopping';
import { foodWarnings } from '../engine/foodWarnings';
import { buildList, type MealContribution } from '../engine/build';

/**
 * One place that assembles the food derivations, so the Shop screen, the Prep
 * screen and the packing list all read the same numbers rather than each
 * recomputing them slightly differently.
 */
export function useFood() {
  const { trip, library } = useStore();

  return useMemo(() => {
    if (!trip) return null;

    const facts = deriveFacts(trip, library);
    const days = tripDays(trip, facts);
    const planned = plannedMeals(trip, library, facts);
    const lines = ingredientLines(planned, facts, library);
    const requirements = mealRequirements(planned);

    const contribution: MealContribution = {
      requiredItems: requirements.map((r) => ({
        itemId: r.itemId,
        reasons: r.reasons,
        role: r.role,
      })),
      ingredients: lines.map((l) => ({
        key: l.key,
        name: l.ingredient.name,
        amount: `${l.amount} ${l.ingredient.unit === 'ea' ? '' : l.ingredient.unit}`.trim(),
        cold: l.cold,
        meals: l.meals,
      })),
    };

    return {
      facts,
      days,
      planned,
      lines,
      requirements,
      contribution,
      cooler: coolerOrder(lines),
      waterL: cookingWaterL(planned, facts),
      prep: generatedPrepTasks(planned),
      shopping: shoppingList(lines, library, trip.attendeeIds),
      warnings: foodWarnings(trip, library, facts, planned, lines, days),
      list: buildList(trip, library, contribution),
    };
  }, [trip, library]);
}
