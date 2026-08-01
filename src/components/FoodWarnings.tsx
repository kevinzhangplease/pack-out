import type { FoodWarning } from '../engine/foodWarnings';

/**
 * The cook's judgement, surfaced. Errors first, because an allergy conflict is
 * a different kind of problem from an unfilled lunch slot.
 */
export function FoodWarnings({ warnings }: { warnings: FoodWarning[] }) {
  if (warnings.length === 0) return null;

  const order = { error: 0, warn: 1, note: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <section className="gates" aria-label="Meal plan warnings">
      {sorted.map((warning) => (
        <div key={warning.id} className={`gate gate--${warning.severity}`}>
          <h3 className="gate__title">{warning.title}</h3>
          <p className="gate__detail">{warning.detail}</p>
          {warning.fix && <p className="gate__fix">{warning.fix}</p>}
        </div>
      ))}
    </section>
  );
}
