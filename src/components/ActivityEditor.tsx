import { useState } from 'react';
import { useStore } from '../state/store';
import { deleteActivity, deletionImpact, upsertActivity } from '../engine/mutations';
import { uniqueId } from '../data/ids';
import type { Activity, Trip } from '../data/types';

/**
 * Activities are editable. A new one starts with no gear attached, and the app
 * says so plainly rather than pretending it did something.
 */
export function ActivityEditor({ trip }: { trip: Trip }) {
  const { library, setLibrary, updateTrip } = useStore();
  const [newName, setNewName] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const gearCount = (id: string) =>
    library.items.filter((item) => JSON.stringify(item.rule).includes(`"${id}"`)).length;

  const toggle = (id: string) =>
    updateTrip({
      ...trip,
      activityIds: trip.activityIds.includes(id)
        ? trip.activityIds.filter((x) => x !== id)
        : [...trip.activityIds, id],
    });

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const activity: Activity = {
      id: uniqueId('act', name, library.activities.map((a) => a.id)),
      name,
    };
    setLibrary(upsertActivity(library, activity), `add activity ${name}`);
    updateTrip({ ...trip, activityIds: [...trip.activityIds, activity.id] });
    setNewName('');
    setJustAdded(name);
  };

  const remove = (activity: Activity) => {
    const result = deleteActivity(library, activity.id);
    setLibrary(result.library, `delete activity ${activity.name}`);
    updateTrip({ ...trip, activityIds: trip.activityIds.filter((x) => x !== activity.id) });
    setConfirming(null);
  };

  return (
    <div className="editor">
      <ul className="chips">
        {library.activities.map((activity) => {
          const on = trip.activityIds.includes(activity.id);
          const count = gearCount(activity.id);
          return (
            <li key={activity.id} className="chips__item">
              <label className={on ? 'chip is-on' : 'chip'}>
                <input type="checkbox" checked={on} onChange={() => toggle(activity.id)} />
                <span className="chip__label">{activity.name}</span>
                <span className="chip__count" title={`${count} items reference this`}>
                  {count}
                </span>
                {activity.minRole && activity.minRole !== 'toddler' && (
                  <span className="chip__age" title="Youngest role this suits">
                    {activity.minRole}+
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {/*
        An activity with no rainy-day alternate makes the day plan fiction on a
        coast where rain is the default. Say so rather than leaving it blank.
      */}
      {trip.activityIds.length > 0 && (
        <ul className="alternates">
          {library.activities
            .filter((a) => trip.activityIds.includes(a.id))
            .map((activity) => (
              <li key={activity.id} className="alternate">
                <span className="alternate__name">{activity.name}</span>
                {activity.rainyAlternate ? (
                  <span className="alternate__text">If it rains: {activity.rainyAlternate}</span>
                ) : (
                  <span className="alternate__text alternate__text--missing">
                    No rainy-day alternate. On this coast that makes the day plan fiction.
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}

      {justAdded && (
        <p className="notice notice--bad" role="status">
          “{justAdded}” has no gear attached to it. Nothing will appear on the list until you write
          a rule that reads it — adding the activity on its own did not change anything.
        </p>
      )}

      <div className="editor__add">
        <input
          type="text"
          className="input"
          placeholder="Add an activity"
          value={newName}
          aria-label="Name of the activity to add"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button type="button" className="btn" onClick={add}>
          Add
        </button>
      </div>

      <details className="editor__manage">
        <summary>Remove an activity</summary>
        <ul className="editor__rows">
          {library.activities.map((activity) => {
            const impact = deletionImpact(library, 'activity', activity.id);
            return (
              <li key={activity.id} className="editor__row">
                <span className="editor__name">{activity.name}</span>
                {confirming === activity.id ? (
                  <span className="editor__confirm">
                    <span className="editor__impact">
                      {impact.orphaned > 0
                        ? `${impact.orphaned} item${impact.orphaned === 1 ? '' : 's'} would be orphaned and stop packing.`
                        : impact.touched > 0
                          ? `${impact.touched} rule${impact.touched === 1 ? '' : 's'} would lose a condition.`
                          : 'Nothing references it.'}
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => remove(activity)}
                    >
                      Delete
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setConfirming(activity.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
