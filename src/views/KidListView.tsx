import { useState } from 'react';
import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { kidList } from '../engine/load';

/**
 * A list a child can own.
 *
 * Big text, short, only their own things, no rule traces and no jargon. It is
 * two things at once: ownership builds competence, and it occupies them during
 * the part of packing that is boring for a six-year-old.
 *
 * Checks share the trip's session state, so what they tick shows as ticked on
 * the grown-up list too.
 */
export function KidListView() {
  const { library, session, toggleCheck } = useStore();
  const food = useFood();
  const kids = food?.facts.attendees.filter((p) => p.role === 'kid' || p.role === 'toddler') ?? [];
  const [whoId, setWhoId] = useState<string | null>(null);

  if (!food) return <p className="empty">No trip selected.</p>;

  if (kids.length === 0) {
    return (
      <p className="empty">
        Nobody on this trip has the kid or toddler role, so there is no kid list to make.
      </p>
    );
  }

  const who = kids.find((k) => k.id === whoId) ?? kids[0]!;
  const list = kidList(food.list, who.id);
  const done = list.filter((e) => session.checked[e.key]).length;

  return (
    <div className="kidlist">
      {kids.length > 1 && (
        <div className="segmented" role="group" aria-label="Whose list">
          {kids.map((kid) => (
            <button
              key={kid.id}
              type="button"
              className={kid.id === who.id ? 'segmented__btn is-active' : 'segmented__btn'}
              aria-pressed={kid.id === who.id}
              onClick={() => setWhoId(kid.id)}
            >
              {kid.name}
            </button>
          ))}
        </div>
      )}

      <div className="kidlist__head">
        <h2 className="kidlist__title">{who.name}&rsquo;s jobs</h2>
        <p className="kidlist__score">
          {done} of {list.length}
        </p>
      </div>

      {list.length === 0 ? (
        <p className="empty">Nothing on this trip is theirs to pack.</p>
      ) : (
        <ul className="kidrows">
          {list.map((entry) => {
            const checked = session.checked[entry.key] ?? false;
            return (
              <li key={entry.key} className={checked ? 'kidrow is-checked' : 'kidrow'}>
                <label className="kidrow__check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCheck(entry.key)}
                  />
                  <span className="kidrow__box" aria-hidden="true" />
                  <span className="kidrow__name">
                    {entry.name}
                    {entry.hint && <span className="kidrow__hint">{entry.hint}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {done === list.length && list.length > 0 && (
        <p className="kidlist__done">All done. Nice work.</p>
      )}

      <p className="editor__note">
        Only {who.name}&rsquo;s own things, capped at twelve so it is finishable. Ticking here
        ticks the same item on the main list. Roles drive this — change {who.name}&rsquo;s role on
        the Plan screen and the list changes with it.
      </p>
      <p className="editor__note">
        {library.people.length > 0 && `Showing the list for the ${who.role} role.`}
      </p>
    </div>
  );
}
