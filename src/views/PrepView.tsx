import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { PHASE_LABELS, PHASES, type Phase } from '../data/types';

/**
 * Prep is a schedule, not a list. This screen is the timeline for everything
 * that has to happen before you leave: the rule-driven actions and the
 * prep-at-home tasks generated from the meal plan, in one order.
 *
 * Pre-chopping and freezing flat is the highest-leverage move in family car
 * camping, and it is the one most often left in somebody's head.
 */
const BEFORE_YOU_GO: Phase[] = ['weeks-out', 't-3-days', 'night-before', 'morning-of', 'en-route'];

export function PrepView({ onEditItem }: { onEditItem: (itemId: string) => void }) {
  const { trip, session, toggleCheck } = useStore();
  const food = useFood();

  if (!trip || !food) return <p className="empty">No trip selected.</p>;

  const actions = food.list.lines.filter((line) => line.item.type === 'action');

  return (
    <div className="prep">
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Before you go</h2>
          <span className="panel__meta">
            {actions.length + food.prep.length} tasks
          </span>
        </div>
        <p className="panel__lede">
          Rule-driven tasks and meal prep on one timeline. The cooking jobs come from the meal
          plan — change a meal and this changes with it.
        </p>
      </section>

      <div className="groups">
      {BEFORE_YOU_GO.map((phase) => {
        const phaseActions = actions.filter((line) => line.item.phase === phase);
        const phasePrep = food.prep.filter((p) => p.task.phase === phase);
        if (phaseActions.length === 0 && phasePrep.length === 0) return null;

        const total = phaseActions.length + phasePrep.length;
        const done =
          phaseActions.filter((l) => session.checked[l.key]).length +
          phasePrep.filter((p) => session.checked[`prep:${p.key}`]).length;

        return (
          <section key={phase} className={done === total ? 'group is-done' : 'group'}>
            <div className="group__head group__head--static">
              <h2 className="group__name">{PHASE_LABELS[phase]}</h2>
              <span className="group__count">
                {done}/{total}
              </span>
            </div>

            <ul className="rows">
              {phasePrep.map((p) => (
                <li
                  key={p.key}
                  className={session.checked[`prep:${p.key}`] ? 'row is-checked' : 'row'}
                >
                  <label className="row__check">
                    <input
                      type="checkbox"
                      checked={session.checked[`prep:${p.key}`] ?? false}
                      onChange={() => toggleCheck(`prep:${p.key}`)}
                    />
                    <span className="row__box" aria-hidden="true" />
                    <span className="row__name">
                      {p.task.name}
                      <span className="row__who">{p.meal.name}</span>
                    </span>
                  </label>
                  <span className="row__tags">
                    <span className="tag tag--consumable">kitchen</span>
                  </span>
                  {p.task.note && <p className="row__note row__note--full">{p.task.note}</p>}
                </li>
              ))}

              {phaseActions.map((line) => (
                <li key={line.key} className={session.checked[line.key] ? 'row is-checked' : 'row'}>
                  <label className="row__check">
                    <input
                      type="checkbox"
                      checked={session.checked[line.key] ?? false}
                      onChange={() => toggleCheck(line.key)}
                    />
                    <span className="row__box" aria-hidden="true" />
                    <span className="row__name">{line.item.name}</span>
                  </label>
                  <span className="row__tags">
                    <span className="tag">{line.item.category}</span>
                  </span>
                  <button
                    type="button"
                    className="row__why"
                    onClick={() => onEditItem(line.item.id)}
                    title={line.why.english}
                  >
                    why
                  </button>
                  {line.item.note && <p className="row__note row__note--full">{line.item.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      </div>

      {food.cooler.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Cooler, bottom to top</h2>
          <p className="panel__lede">
            Load in this order. Frozen goes in first and does the work of ice; the last thing you
            will eat goes in next, so day-three food sits at the bottom where it stays coldest.
          </p>
          <ol className="cooler">
            {food.cooler.map((line, i) => (
              <li key={line.key} className={`cooler__layer cooler__layer--${line.cold}`}>
                <span className="cooler__n">{i + 1}</span>
                <span className="cooler__name">{line.ingredient.name}</span>
                <span className="cooler__meta">
                  {line.cold === 'frozen' ? 'frozen — this is your ice' : `day ${line.firstDayIndex + 1}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {PHASES.filter((p) => !BEFORE_YOU_GO.includes(p)).map((phase) => {
        const lines = actions.filter((line) => line.item.phase === phase);
        if (lines.length === 0) return null;
        return (
          <section key={phase} className="group">
            <div className="group__head group__head--static">
              <h2 className="group__name">{PHASE_LABELS[phase]}</h2>
              <span className="group__count">{lines.length}</span>
            </div>
            <ul className="rows">
              {lines.map((line) => (
                <li key={line.key} className={session.checked[line.key] ? 'row is-checked' : 'row'}>
                  <label className="row__check">
                    <input
                      type="checkbox"
                      checked={session.checked[line.key] ?? false}
                      onChange={() => toggleCheck(line.key)}
                    />
                    <span className="row__box" aria-hidden="true" />
                    <span className="row__name">{line.item.name}</span>
                  </label>
                  {line.item.note && <p className="row__note row__note--full">{line.item.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
