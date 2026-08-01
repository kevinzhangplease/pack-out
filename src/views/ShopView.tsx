import { useState } from 'react';
import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { shoppingListToText, toBuyCount } from '../engine/shopping';
import { FoodWarnings } from '../components/FoodWarnings';
import { MEAL_SLOTS, type MealSlot, type Trip } from '../data/types';
import { counterId } from '../data/ids';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * Meals and the shopping list live together because they are one job: you plan
 * what you will eat, and the list of what to buy falls out of it. The prep
 * tasks that also fall out of it belong to a different moment, so they are on
 * the Prep screen instead.
 */
export function ShopView() {
  const { trip, trips, library, updateTrip, setLibrary, setTrips } = useStore();
  const food = useFood();
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  if (!trip || !food) return <p className="empty">No trip selected.</p>;

  const addMeal = (dayIndex: number, slot: MealSlot, mealId: string) => {
    if (!mealId) return;
    const entry = {
      id: counterId('mp', trip.mealPlan.map((m) => m.id)),
      dayIndex,
      slot,
      mealId,
    };
    updateTrip({ ...trip, mealPlan: [...trip.mealPlan, entry] });
  };

  const removeEntry = (id: string) =>
    updateTrip({
      ...trip,
      mealPlan: trip.mealPlan
        .filter((m) => m.id !== id)
        // Anything pointing at the removed meal loses its source rather than
        // keeping a dangling reference.
        .map((m) => (m.leftoversFrom === id ? { ...m, leftoversFrom: undefined } : m)),
    });

  const setLeftoversSource = (entryId: string, sourceId: string) =>
    updateTrip({
      ...trip,
      mealPlan: trip.mealPlan.map((m) =>
        m.id === entryId ? { ...m, leftoversFrom: sourceId || undefined } : m,
      ),
    });

  /**
   * Copy a whole day onto another day. This REPLACES whatever was on the target
   * day, so it goes through setTrips rather than updateTrip — that puts it on
   * the undo stack, which every destructive action needs.
   */
  const copyDay = (from: number, to: number) => {
    const source = trip.mealPlan.filter((m) => m.dayIndex === from);
    const replaced = trip.mealPlan.filter((m) => m.dayIndex === to).length;
    let ids = trip.mealPlan.map((m) => m.id);
    const copies = source.map((m) => {
      const id = counterId('mp', ids);
      ids = [...ids, id];
      // A copied leftovers link would point at the wrong day, so it is dropped.
      return { ...m, id, dayIndex: to, leftoversFrom: undefined };
    });
    const next = {
      ...trip,
      mealPlan: [...trip.mealPlan.filter((m) => m.dayIndex !== to), ...copies],
    };
    setTrips(
      trips.map((t) => (t.id === trip.id ? next : t)),
      replaced > 0
        ? `copy a day over ${replaced} meal${replaced === 1 ? '' : 's'}`
        : 'copy a day',
    );
    setCopyNotice(
      replaced > 0
        ? `Replaced ${replaced} meal${replaced === 1 ? '' : 's'} on that day. Undo is on the Data screen.`
        : null,
    );
  };

  const dinnersBefore = (dayIndex: number) =>
    food.planned.filter((p) => p.entry.slot === 'dinner' && p.day.dayIndex < dayIndex);

  const copyShopping = () => {
    void navigator.clipboard?.writeText(shoppingListToText(food.shopping));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="shop">
      <FoodWarnings warnings={food.warnings} />

      {copyNotice && (
        <p className="notice notice--bad" role="status">
          {copyNotice}
        </p>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Meal plan</h2>
          <span className="panel__meta">
            {food.planned.length} meals · {food.facts.eaterUnits.toFixed(1)} eater units ·{' '}
            {food.waterL} L cooking water
          </span>
        </div>

        {food.days.length === 0 ? (
          <p className="empty">Set the dates first — meals are planned against real days.</p>
        ) : (
          <ol className="days">
            {food.days.map((day) => (
              <li key={day.dayIndex} className="day">
                <div className="day__head">
                  <h3 className="day__label">
                    {day.label}
                    {day.isArrivalDay && <span className="day__tag">arrival</span>}
                    {day.isDepartureDay && <span className="day__tag">home</span>}
                  </h3>
                  {food.days.length > 1 && (
                    <label className="day__copy">
                      <span className="visually-hidden">Copy {day.label} to</span>
                      <select
                        className="input input--inline"
                        value=""
                        aria-label={`Copy ${day.label} to another day`}
                        onChange={(e) => {
                          if (e.target.value) copyDay(day.dayIndex, Number(e.target.value));
                          e.target.value = '';
                        }}
                      >
                        <option value="">Copy to…</option>
                        {food.days
                          .filter((d) => d.dayIndex !== day.dayIndex)
                          .map((d) => (
                            <option key={d.dayIndex} value={d.dayIndex}>
                              {d.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>

                {MEAL_SLOTS.map((slot) => {
                  const entries = food.planned.filter(
                    (p) => p.day.dayIndex === day.dayIndex && p.entry.slot === slot,
                  );
                  return (
                    <div key={slot} className="slot">
                      <h4 className="slot__label">{SLOT_LABELS[slot]}</h4>
                      <ul className="slot__meals">
                        {entries.map((p) => (
                          <li key={p.entry.id} className="slot__meal">
                            <span className="slot__name">
                              {p.meal.name}
                              {p.meal.project && <span className="tag tag--bad">project</span>}
                              {p.meal.needsFire && <span className="tag">fire</span>}
                              {p.meal.noCook && <span className="tag">no-cook</span>}
                              {p.meal.pots > 0 && (
                                <span className="tag">
                                  {p.meal.pots} pot{p.meal.pots === 1 ? '' : 's'}
                                </span>
                              )}
                            </span>

                            {p.meal.id === 'meal-leftovers' && (
                              <label className="slot__source">
                                <span className="visually-hidden">Leftovers from</span>
                                <select
                                  className="input input--inline"
                                  value={p.entry.leftoversFrom ?? ''}
                                  aria-label="Leftovers from which dinner"
                                  onChange={(e) => setLeftoversSource(p.entry.id, e.target.value)}
                                >
                                  <option value="">Leftovers from…</option>
                                  {dinnersBefore(day.dayIndex).map((d) => (
                                    <option key={d.entry.id} value={d.entry.id}>
                                      {d.day.label}: {d.meal.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => removeEntry(p.entry.id)}
                              aria-label={`Remove ${p.meal.name}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>

                      <select
                        className="input input--inline"
                        value=""
                        aria-label={`Add a meal to ${day.label} ${slot}`}
                        onChange={(e) => {
                          addMeal(day.dayIndex, slot, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="">Add {SLOT_LABELS[slot].toLowerCase()}…</option>
                        {library.meals
                          .filter((m) => m.slots.includes(slot))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Shopping list</h2>
          <span className="panel__meta">{toBuyCount(food.shopping)} to buy</span>
        </div>
        <p className="panel__lede">
          A different document from the packing list, used at a different time, grouped the way you
          walk a shop. Amounts are scaled by eater units, not headcount.
        </p>

        <div className="editor__add">
          <button type="button" className="btn btn--sm" onClick={copyShopping}>
            {copied ? 'Copied' : 'Copy as text'}
          </button>
        </div>

        {food.shopping.length === 0 ? (
          <p className="empty">Nothing to buy — there are no meals planned.</p>
        ) : (
          food.shopping.map((section) => (
            <div key={section.section} className="shop-section">
              <h3 className="shop-section__label">{section.label}</h3>
              <ul className="shop-section__items">
                {section.items.map((item) => (
                  <li
                    key={item.key}
                    className={item.pantryInStock ? 'shop-item is-stocked' : 'shop-item'}
                  >
                    <span className="shop-item__name">{item.name}</span>
                    <span className="shop-item__amount">{item.amount}</span>
                    {item.pantryInStock ? (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() =>
                          setLibrary(
                            { ...library, pantry: { ...library.pantry, [item.name]: false } },
                            `mark ${item.name} out of stock`,
                          )
                        }
                      >
                        Ran out
                      </button>
                    ) : (
                      library.pantry[item.name] !== undefined && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() =>
                            setLibrary(
                              { ...library, pantry: { ...library.pantry, [item.name]: true } },
                              `mark ${item.name} restocked`,
                            )
                          }
                        >
                          Restocked
                        </button>
                      )
                    )}
                    {item.conflicts.length > 0 && (
                      <span className="tag tag--bad">{item.conflicts.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="editor__note">
          Struck-through lines are pantry staples believed to be in the pantry box. Stock is
          tracked, not presence — and it never removes anything from the packing list.
        </p>
      </section>
    </div>
  );
}

export function tripHasMeals(trip: Trip): boolean {
  return trip.mealPlan.length > 0;
}
