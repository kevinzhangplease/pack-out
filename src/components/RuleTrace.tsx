import type { RuleTrace as Trace } from '../engine/conditions';
import type { QtyTrace } from '../engine/quantity';

/**
 * The interpretation trail. Every condition, whether it passed, and what the
 * trip actually said — the same structure that decided the outcome, so the
 * explanation cannot disagree with the decision.
 */
export function RuleTraceView({
  why,
  howMany,
  onEdit,
}: {
  why: Trace;
  howMany?: QtyTrace;
  onEdit?: () => void;
}) {
  return (
    <div className="trace">
      <p className="trace__rule">{why.english}</p>
      <ul className="trace__conds">
        {why.conds.map((cond, i) => (
          <li key={i} className={cond.passed ? 'trace__cond is-pass' : 'trace__cond is-fail'}>
            <span className="trace__mark" aria-hidden="true">
              {cond.passed ? '✓' : '✕'}
            </span>
            <span className="trace__text">
              {cond.english}
              {cond.actual && <span className="trace__actual"> — {cond.actual}</span>}
            </span>
            {cond.children && cond.children.length > 0 && (
              <ul className="trace__children">
                {cond.children.map((child, j) => (
                  <li
                    key={j}
                    className={child.passed ? 'trace__cond is-pass' : 'trace__cond is-fail'}
                  >
                    <span className="trace__mark" aria-hidden="true">
                      {child.passed ? '✓' : '✕'}
                    </span>
                    <span className="trace__text">
                      {child.english}
                      {child.actual && <span className="trace__actual"> — {child.actual}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {howMany && <p className="trace__qty">How many: {howMany.english}</p>}
      {onEdit && (
        <button type="button" className="btn btn--sm" onClick={onEdit}>
          Edit this rule
        </button>
      )}
    </div>
  );
}
