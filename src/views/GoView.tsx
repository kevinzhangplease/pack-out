import { useState } from 'react';
import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { evaluateGates } from '../engine/gates';
import {
  applyCoverage,
  jurisdictionNotes,
  roleClashes,
  seasonalHazards,
  splittableItems,
  suggestedCampRoles,
  tripPlanDocument,
} from '../engine/judgement';
import { counterId } from '../data/ids';
import {
  CAMP_JOBS,
  CAMP_JOB_LABELS,
  JURISDICTIONS,
  JURISDICTION_LABELS,
  type CampJob,
  type Jurisdiction,
  type TripPlan,
} from '../data/types';

/**
 * Go: everything that is about the trip being a real thing that happens in the
 * world rather than a list. The trip plan document, the hazards keyed to when
 * you are actually going, whose land it is, who does which job, and what the
 * other family is bringing.
 */
export function GoView() {
  const { trip, trips, library, setTrips, updateTrip } = useStore();
  const food = useFood();
  const [copied, setCopied] = useState(false);

  if (!trip || !food) return <p className="empty">No trip selected.</p>;

  const gates = evaluateGates(trip, food.facts, food.list);
  const doc = tripPlanDocument(trip, library, food.facts, food.list, gates);
  const hazards = seasonalHazards(trip, food.facts);
  const notes = jurisdictionNotes(trip.jurisdiction);
  const coverage = applyCoverage(food.list.lines, trip);
  const splittable = splittableItems(food.list.lines);
  const clashes = roleClashes(trip.campRoles, library);

  const dinnerSuggestions = suggestedCampRoles(
    food.planned
      .filter((p) => p.entry.slot === 'dinner')
      .map((p) => ({ dayIndex: p.day.dayIndex, label: p.day.label, mealName: p.meal.name })),
  );

  const setPlan = (patch: Partial<TripPlan>) =>
    updateTrip({ ...trip, plan: { ...trip.plan, ...patch } });

  const setRole = (job: CampJob, dayIndex: number | undefined, personId: string) => {
    const existing = trip.campRoles.find((r) => r.job === job && r.dayIndex === dayIndex);
    const campRoles = existing
      ? personId
        ? trip.campRoles.map((r) => (r === existing ? { ...r, personId } : r))
        : trip.campRoles.filter((r) => r !== existing)
      : [
          ...trip.campRoles,
          { id: counterId('role', trip.campRoles.map((r) => r.id)), job, dayIndex, personId },
        ];
    updateTrip({ ...trip, campRoles });
  };

  const roleFor = (job: CampJob, dayIndex: number | undefined) =>
    trip.campRoles.find((r) => r.job === job && r.dayIndex === dayIndex)?.personId ?? '';

  const share = (itemId: string, householdId: string) => {
    const coveredBy = { ...trip.coveredBy };
    if (householdId) coveredBy[itemId] = householdId;
    else delete coveredBy[itemId];
    setTrips(
      trips.map((t) => (t.id === trip.id ? { ...trip, coveredBy } : t)),
      householdId ? 'mark an item as covered' : 'take an item back',
    );
  };

  return (
    <div className="go">
      <section className={doc.complete ? 'panel panel--plan' : 'panel panel--plan is-incomplete'}>
        <div className="panel__head">
          <h2 className="panel__title">Trip plan</h2>
          <span className="panel__meta">{doc.complete ? 'complete' : 'incomplete'}</span>
        </div>
        <p className="panel__lede">
          A first-class document, not a checkbox. Whoever holds it needs to be able to act on it
          without knowing anything about camping.
        </p>

        {!doc.complete && (
          <p className="notice notice--bad" role="status">
            Still missing: {doc.missing.join(', ')}.
          </p>
        )}

        <div className="fields">
          <label className="field field--wide">
            <span className="field__label">Route</span>
            <textarea
              className="input input--area"
              rows={2}
              value={trip.plan.routeNotes}
              onChange={(e) => setPlan({ routeNotes: e.target.value })}
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">Bail-out points</span>
            <textarea
              className="input input--area"
              rows={2}
              value={trip.plan.bailOutPoints}
              onChange={(e) => setPlan({ bailOutPoints: e.target.value })}
            />
            <span className="field__hint">Where you would go if it went wrong at the halfway mark.</span>
          </label>
          <label className="field">
            <span className="field__label">Nearest hospital</span>
            <input
              type="text"
              className="input"
              value={trip.plan.nearestHospital}
              onChange={(e) => setPlan({ nearestHospital: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Who to call</span>
            <input
              type="text"
              className="input"
              value={trip.plan.contactName}
              onChange={(e) => setPlan({ contactName: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Their phone</span>
            <input
              type="tel"
              className="input"
              value={trip.plan.contactPhone}
              onChange={(e) => setPlan({ contactPhone: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Overdue at</span>
            <input
              type="text"
              className="input"
              placeholder="8pm Monday"
              value={trip.plan.overdue}
              onChange={(e) => setPlan({ overdue: e.target.value })}
            />
            <span className="field__hint">After this, they act. Make it a time, not a feeling.</span>
          </label>
        </div>

        <div className="editor__add">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              void navigator.clipboard?.writeText(doc.text);
              setPlan({ sharedAtISO: new Date().toISOString() });
              setCopied(true);
              setTimeout(() => setCopied(false), 3000);
            }}
          >
            {copied ? 'Copied' : 'Copy the plan to send'}
          </button>
          {trip.plan.sharedAtISO && (
            <span className="editor__impact">
              Last copied {new Date(trip.plan.sharedAtISO).toLocaleString()}
            </span>
          )}
        </div>

        <pre className="plan__preview">{doc.text}</pre>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Whose land</h2>
        </div>
        <select
          className="input"
          value={trip.jurisdiction}
          aria-label="Jurisdiction"
          onChange={(e) => updateTrip({ ...trip, jurisdiction: e.target.value as Jurisdiction })}
        >
          {JURISDICTIONS.map((j) => (
            <option key={j} value={j}>
              {JURISDICTION_LABELS[j]}
            </option>
          ))}
        </select>
        <ul className="notes">
          {notes.map((note, i) => (
            <li key={i} className="note">
              <span className="note__topic">{note.topic.replace('-', ' ')}</span>
              <span className="note__text">{note.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {hazards.length > 0 && (
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">For this time of year</h2>
            <span className="panel__meta">keyed to {trip.startDate}</span>
          </div>
          <ul className="hazards">
            {hazards.map((hazard) => (
              <li key={hazard.id} className="hazard">
                <h3 className="hazard__title">{hazard.title}</h3>
                <p className="hazard__detail">{hazard.detail}</p>
                {hazard.check && <p className="hazard__check">{hazard.check}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Camp jobs</h2>
        </div>
        <p className="panel__lede">
          Who pitches, who cooks, who does the dishes. Assigning it beforehand is the difference
          between a camp that runs and one where two people do everything.
        </p>

        {clashes.map((clash, i) => (
          <p key={i} className="notice notice--bad" role="status">
            {clash}
          </p>
        ))}

        <h3 className="editor__subtitle">Whole trip</h3>
        <ul className="editor__rows">
          {CAMP_JOBS.filter((j) => j !== 'cook' && j !== 'dishes').map((job) => (
            <li key={job} className="editor__row">
              <span className="editor__name">{CAMP_JOB_LABELS[job]}</span>
              <select
                className="input input--inline"
                value={roleFor(job, undefined)}
                aria-label={CAMP_JOB_LABELS[job]}
                onChange={(e) => setRole(job, undefined, e.target.value)}
              >
                <option value="">Nobody</option>
                {food.facts.attendees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        {dinnerSuggestions.length > 0 && (
          <>
            <h3 className="editor__subtitle">From the meal plan</h3>
            <ul className="editor__rows">
              {dinnerSuggestions.map((suggestion) => (
                <li key={`${suggestion.job}-${suggestion.dayIndex}`} className="editor__row">
                  <span className="editor__name">
                    {CAMP_JOB_LABELS[suggestion.job]} — {suggestion.label}
                  </span>
                  <select
                    className="input input--inline"
                    value={roleFor(suggestion.job, suggestion.dayIndex)}
                    aria-label={`${CAMP_JOB_LABELS[suggestion.job]} ${suggestion.label}`}
                    onChange={(e) => setRole(suggestion.job, suggestion.dayIndex, e.target.value)}
                  >
                    <option value="">Nobody</option>
                    {food.facts.attendees.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Camping with another family</h2>
          {coverage.theirs.length > 0 && (
            <span className="panel__meta">
              {(coverage.savedWeight_g / 1000).toFixed(1)} kg they are carrying
            </span>
          )}
        </div>
        <p className="panel__lede">
          Mark what somebody else is bringing so four camp stoves do not show up. Covered items stay
          visible — what you are relying on somebody else for is exactly what gets forgotten.
        </p>

        <ul className="editor__rows">
          {trip.households.map((household) => (
            <li key={household.id} className="editor__row">
              <input
                type="text"
                className="input input--inline"
                value={household.name}
                aria-label="Household name"
                onChange={(e) =>
                  updateTrip({
                    ...trip,
                    households: trip.households.map((h) =>
                      h.id === household.id ? { ...h, name: e.target.value } : h,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const coveredBy = { ...trip.coveredBy };
                  for (const [itemId, id] of Object.entries(coveredBy)) {
                    if (id === household.id) delete coveredBy[itemId];
                  }
                  setTrips(
                    trips.map((t) =>
                      t.id === trip.id
                        ? {
                            ...trip,
                            households: trip.households.filter((h) => h.id !== household.id),
                            coveredBy,
                          }
                        : t,
                    ),
                    `remove ${household.name}`,
                  );
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="editor__add">
          <button
            type="button"
            className="btn"
            onClick={() =>
              updateTrip({
                ...trip,
                households: [
                  ...trip.households,
                  {
                    id: counterId('hh', trip.households.map((h) => h.id)),
                    name: `Another family ${trip.households.length + 1}`,
                  },
                ],
              })
            }
          >
            Add another household
          </button>
        </div>

        {trip.households.length > 0 && (
          <>
            <h3 className="editor__subtitle">Group gear — who brings it</h3>
            <ul className="editor__rows">
              {splittable.map((line) => (
                <li key={line.key} className="editor__row">
                  <span className="editor__name">{line.item.name}</span>
                  <select
                    className="input input--inline"
                    value={trip.coveredBy[line.item.id] ?? ''}
                    aria-label={`Who brings the ${line.item.name}`}
                    onChange={(e) => share(line.item.id, e.target.value)}
                  >
                    <option value="">We bring it</option>
                    {trip.households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}

        {coverage.theirs.length > 0 && (
          <>
            <h3 className="editor__subtitle">Not on your list, because they have it</h3>
            <ul className="rows">
              {coverage.theirs.map(({ line, householdName }) => (
                <li key={line.key} className="row row--dropped">
                  <span className="row__name">
                    {line.item.name}
                    <span className="row__who">{householdName}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => share(line.item.id, '')}
                  >
                    We bring it
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
