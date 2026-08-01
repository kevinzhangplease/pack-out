import { useState } from 'react';
import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { LoadPlan } from '../components/LoadPlan';
import {
  applyLeftBehind,
  boatZoneBalance,
  byResponsibility,
  loadPlan,
  PACK_WEIGHT_LIMIT,
  shakedown,
} from '../engine/load';
import { TRANSPORTS, type Transport } from '../data/types';

const TRANSPORT_LABELS: Record<Transport, string> = {
  vehicle: 'Vehicle',
  carried: 'On your back',
  boat: 'Kayak',
};

export function LoadPlanView() {
  const { trip, library, trips, setTrips, session, toggleCheck } = useStore();
  const food = useFood();
  const [transport, setTransport] = useState<Transport | null>(null);
  const [zone, setZone] = useState<string | null>(null);

  if (!trip || !food) return <p className="empty">No trip selected.</p>;

  // Defaults to the trip's own transport, but is switchable — you drive to
  // trailheads, and the same list has to be loaded twice.
  const active = transport ?? food.facts.transport;

  const { going, dropped } = applyLeftBehind(food.list.lines, trip.leftBehind);
  const groups = loadPlan(going, active, library);
  const selected = groups.find((g) => String(g.zone) === zone);
  const pass = shakedown({ ...food.list, lines: going }, food.facts, dropped, active);
  const trim = active === 'boat' ? boatZoneBalance(groups) : null;
  const responsibility = byResponsibility(going, trip, library);

  const setLeftBehind = (itemId: string, leave: boolean) => {
    const next = {
      ...trip,
      leftBehind: leave
        ? [...trip.leftBehind, itemId]
        : trip.leftBehind.filter((id) => id !== itemId),
    };
    setTrips(
      trips.map((t) => (t.id === trip.id ? next : t)),
      leave ? 'leave an item behind' : 'bring an item back',
    );
  };

  return (
    <div className="loadview">
      <div className="list__bar">
        <div className="segmented" role="group" aria-label="Load plan for">
          {TRANSPORTS.map((t) => (
            <button
              key={t}
              type="button"
              className={active === t ? 'segmented__btn is-active' : 'segmented__btn'}
              aria-pressed={active === t}
              onClick={() => {
                setTransport(t);
                setZone(null);
              }}
            >
              {TRANSPORT_LABELS[t]}
            </button>
          ))}
        </div>
        <span className="list__meta">
          <span className="list__weight">{(going.reduce((s, l) => s + l.weight_g, 0) / 1000).toFixed(1)} kg</span>
        </span>
      </div>

      {active !== food.facts.transport && (
        <p className="notice" role="status">
          Showing the {TRANSPORT_LABELS[active].toLowerCase()} plan for a {food.facts.transport}{' '}
          trip. Useful when you drive to a trailhead; the list is the same either way.
        </p>
      )}

      <LoadPlan transport={active} groups={groups} selected={zone} onSelect={setZone} />

      {trim && (
        <p className="notice notice--bad" role="status">
          {trim}
        </p>
      )}

      {selected ? (
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{selected.label}</h2>
            <span className="panel__meta">
              {selected.lines.length} · {(selected.weight_g / 1000).toFixed(1)} kg
            </span>
          </div>
          {selected.note && <p className="panel__lede">{selected.note}</p>}
          <ul className="rows">
            {selected.lines.map((line) => (
              <li key={line.key} className={session.checked[line.key] ? 'row is-checked' : 'row'}>
                <label className="row__check">
                  <input
                    type="checkbox"
                    checked={session.checked[line.key] ?? false}
                    onChange={() => toggleCheck(line.key)}
                  />
                  <span className="row__box" aria-hidden="true" />
                  <span className="row__name">
                    {line.item.name}
                    {line.qty > 1 && <span className="row__qty">×{line.qty}</span>}
                    {line.person && <span className="row__who">{line.person.name}</span>}
                  </span>
                </label>
                <span className="row__tags">
                  {line.weight_g > 0 && (
                    <span className="tag">{(line.weight_g / 1000).toFixed(1)} kg</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="editor__note">
          Tap a zone to see what goes in it and why it goes there.
        </p>
      )}

      {pass.applies && (
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Shakedown</h2>
            <span className="panel__meta">
              limit is {Math.round(PACK_WEIGHT_LIMIT * 100)}% of body weight
            </span>
          </div>
          <p className="panel__lede">
            Group gear is divided among the adults, because that is who carries it.
          </p>

          <ul className="loads">
            {pass.perPerson.map((load) => (
              <li key={load.person.id} className={load.overLimit ? 'load is-over' : 'load'}>
                <div className="load__head">
                  <strong className="load__name">{load.person.name}</strong>
                  <span className="load__weight">
                    {(load.weight_g / 1000).toFixed(1)} kg · {Math.round(load.ratio * 100)}%
                  </span>
                </div>
                <div
                  className="load__bar"
                  role="img"
                  aria-label={`${Math.round(load.ratio * 100)} percent of body weight`}
                >
                  <span
                    className="load__fill"
                    style={{ width: `${Math.min(100, load.ratio * 100 * 2.5)}%` }}
                  />
                  <span className="load__limit" />
                </div>
                <p className="load__meta">
                  {load.assumedBodyWeight
                    ? `Assuming ${load.bodyWeight_kg} kg — the app does not know their weight, so this is a guess. Set it on the Plan screen for a real number.`
                    : `${load.bodyWeight_kg} kg body weight.`}
                </p>

                {load.overLimit && (
                  <details className="load__drop">
                    <summary>Heaviest things they are carrying</summary>
                    <ul className="rows">
                      {load.heaviest.map((line) => (
                        <li key={line.key} className="row">
                          <span className="row__name">{line.item.name}</span>
                          <span className="row__tags">
                            <span className="tag">{(line.weight_g / 1000).toFixed(1)} kg</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => setLeftBehind(line.item.id, true)}
                          >
                            Leave behind
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dropped.length > 0 && (
        <section className="panel panel--dropped">
          <div className="panel__head">
            <h2 className="panel__title">Left behind on purpose</h2>
            <span className="panel__meta">
              {(pass.leftBehindWeight_g / 1000).toFixed(1)} kg saved
            </span>
          </div>
          <p className="panel__lede">
            Shown rather than deleted. A decision is not the same as an absence, and you should be
            able to see what you chose to drop.
          </p>
          <ul className="rows">
            {dropped.map((line) => (
              <li key={line.key} className="row row--dropped">
                <span className="row__name">{line.item.name}</span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setLeftBehind(line.item.id, false)}
                >
                  Bring it
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Who packs what</h2>
        <p className="panel__lede">
          Not the same as whose it is. Assign a container and everything in it follows.
        </p>
        <ul className="editor__rows">
          {library.containers
            .filter((c) => c.id !== 'not-packed')
            .map((container) => (
              <li key={container.id} className="editor__row">
                <span className="editor__name">{container.name}</span>
                <select
                  className="input input--inline"
                  value={trip.packedBy[container.id] ?? ''}
                  aria-label={`Who packs the ${container.name}`}
                  onChange={(e) => {
                    const next = { ...trip.packedBy };
                    if (e.target.value) next[container.id] = e.target.value;
                    else delete next[container.id];
                    setTrips(
                      trips.map((t) => (t.id === trip.id ? { ...trip, packedBy: next } : t)),
                      `assign ${container.name}`,
                    );
                  }}
                >
                  <option value="">Nobody</option>
                  {food.facts.attendees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
        </ul>

        <ul className="split">
          {responsibility.map((group) => (
            <li key={group.key} className="split__person">
              <strong>{group.label}</strong>
              <span className="split__count">
                {group.lines.length} items · {(group.weight_g / 1000).toFixed(1)} kg
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
