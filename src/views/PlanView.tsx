import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { buildList } from '../engine/build';
import { diffLists, type ListDiff } from '../engine/diff';
import { nightsBetween } from '../engine/facts';
import { InfoButton } from '../components/InfoButton';
import { PeopleEditor } from '../components/PeopleEditor';
import { ActivityEditor } from '../components/ActivityEditor';
import { SiteQuestions, ShelterEditor, WeatherSection } from '../components/TripSections';
import type { InfoField } from '../engine/infoPanel';
import { SITE_QUESTIONS, STYLE_TRANSPORT, TRIP_STYLES, type TripStyle } from '../data/types';
import { counterId } from '../data/ids';
import type { Trip } from '../data/types';

const STYLE_LABELS: Record<TripStyle, string> = {
  'car-camping': 'Car camping',
  'van-camping': 'Van camping',
  'crown-land': 'Crown land',
  backcountry: 'Backcountry',
  paddle: 'Kayak / canoe',
  hut: 'Hut to hut',
};

export function PlanView({ onEditItem }: { onEditItem: (itemId: string) => void }) {
  const { trip, trips, library, updateTrip, setTrips, setActiveTrip } = useStore();

  const result = useMemo(() => (trip ? buildList(trip, library) : null), [trip, library]);
  const packingIds = useMemo(
    () => new Set(result?.lines.map((l) => l.item.id) ?? []),
    [result],
  );
  const diff = useLiveDiff(result);

  if (!trip || !result) return <p className="empty">No trip selected.</p>;

  const nights = nightsBetween(trip.startDate, trip.endDate);

  /**
   * A new trip inherits the durable choices — style, vehicle, who packs which
   * container — and NOTHING that belongs to the trip that just happened.
   *
   * The review in particular must reset. Carrying a completed review forward
   * would hand the learning loop a second, fabricated data point with the same
   * verdicts, and it would start proposing rule edits from evidence that does
   * not exist.
   */
  const newTrip = () => {
    const id = counterId('trip', trips.map((t) => t.id));
    const next: Trip = {
      ...trip,
      id,
      name: 'New trip',
      attendeeIds: [],
      activityIds: [],
      shelters: [],
      site: {},
      mealPlan: [],
      leftBehind: [],
      coveredBy: {},
      households: [],
      campRoles: [],
      review: { entries: [] },
      plan: { ...trip.plan, overdue: '', sharedAtISO: undefined },
    };
    setTrips([...trips, next], 'add a trip');
    setActiveTrip(id);
  };

  return (
    <div className="plan">
      {diff && (
        <div className="diff" role="status" aria-live="polite">
          <strong className="diff__summary">{diff.summary}</strong>
          <span className="diff__detail">
            {[
              ...diff.added.slice(0, 4).map((l) => `+ ${l.item.name}`),
              ...diff.removed.slice(0, 4).map((l) => `− ${l.item.name}`),
            ].join(' · ')}
          </span>
        </div>
      )}

      <div className="trip-switch">
        <label className="field field--inline">
          <span className="field__label">Trip</span>
          <select
            className="input"
            value={trip.id}
            onChange={(e) => setActiveTrip(e.target.value)}
            aria-label="Switch trip"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--sm" onClick={newTrip}>
          New trip
        </button>
        {trips.length > 1 && (
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => {
              const remaining = trips.filter((t) => t.id !== trip.id);
              setTrips(remaining, `delete trip ${trip.name}`);
              setActiveTrip(remaining[0]!.id);
            }}
          >
            Delete trip
          </button>
        )}
      </div>

      <Section
        title="Dates and place"
        section="dates, drive time and location"
        fields={[
          { kind: 'numeric', field: 'nights' },
          { kind: 'numeric', field: 'days' },
          { kind: 'numeric', field: 'driveHours' },
        ]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <div className="fields">
          <label className="field">
            <span className="field__label">Trip name</span>
            <input
              type="text"
              className="input"
              value={trip.name}
              onChange={(e) => updateTrip({ ...trip, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Start</span>
            <input
              type="date"
              className="input"
              value={trip.startDate}
              onChange={(e) => updateTrip({ ...trip, startDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">End</span>
            <input
              type="date"
              className="input"
              value={trip.endDate}
              onChange={(e) => updateTrip({ ...trip, endDate: e.target.value })}
            />
            <span className="field__hint">
              {nights} night{nights === 1 ? '' : 's'}, {nights > 0 ? nights + 1 : 0} days — derived,
              never stored.
            </span>
          </label>
          <label className="field">
            <span className="field__label">Location</span>
            <input
              type="text"
              className="input"
              value={trip.location}
              placeholder="Porteau Cove, BC"
              onChange={(e) => updateTrip({ ...trip, location: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Drive hours</span>
            <input
              type="number"
              step="0.5"
              min="0"
              className="input"
              value={trip.driveHours}
              onChange={(e) => updateTrip({ ...trip, driveHours: Number(e.target.value) })}
            />
            <span className="field__hint">
              Car snacks and kid activities scale with this, not with nights.
            </span>
          </label>
        </div>
      </Section>

      <Section
        title="Trip style"
        section="the trip style"
        fields={[
          { kind: 'set', field: 'style' },
          { kind: 'set', field: 'transport' },
        ]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <ul className="chips">
          {TRIP_STYLES.map((style) => (
            <li key={style} className="chips__item">
              <label className={trip.style === style ? 'chip is-on' : 'chip'}>
                <input
                  type="radio"
                  name="trip-style"
                  checked={trip.style === style}
                  onChange={() => updateTrip({ ...trip, style })}
                />
                <span className="chip__label">{STYLE_LABELS[style]}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="editor__note">
          Transport is derived: this one is <strong>{STYLE_TRANSPORT[trip.style]}</strong>. Winter is
          not a style — it is the overnight low, and it cuts across all six.
        </p>
      </Section>

      <Section
        title="Weather"
        section="the weather"
        fields={[
          { kind: 'set', field: 'precip' },
          { kind: 'numeric', field: 'overnightLow' },
          { kind: 'numeric', field: 'daytimeHigh' },
          { kind: 'numeric', field: 'windKph' },
        ]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <WeatherSection trip={trip} />
      </Section>

      <Section
        title="Who is going"
        section="the people going"
        fields={[
          { kind: 'set', field: 'role' },
          { kind: 'set', field: 'person' },
          { kind: 'numeric', field: 'people' },
        ]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <PeopleEditor trip={trip} />
      </Section>

      <Section
        title="Activities"
        section="the activities"
        fields={[{ kind: 'set', field: 'activity' }]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <ActivityEditor trip={trip} />
      </Section>

      <Section
        title="The site"
        section="the site questionnaire"
        fields={SITE_QUESTIONS.map((question) => ({ kind: 'site', question }) as InfoField)}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <SiteQuestions trip={trip} />
      </Section>

      <Section
        title="Sleeping arrangement"
        section="the sleeping arrangement"
        fields={[{ kind: 'qtyUnit', unit: 'perShelter' }]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <ShelterEditor trip={trip} />
      </Section>

      <Section
        title="Vehicles and racks"
        section="vehicles and racks"
        fields={[
          { kind: 'set', field: 'vehicle' },
          { kind: 'set', field: 'rack' },
        ]}
        library={library}
        packingIds={packingIds}
        onEditItem={onEditItem}
      >
        <div className="editor">
          <ul className="chips">
            {library.vehicles.map((vehicle) => (
              <li key={vehicle.id} className="chips__item">
                <label className={trip.vehicleIds.includes(vehicle.id) ? 'chip is-on' : 'chip'}>
                  <input
                    type="checkbox"
                    checked={trip.vehicleIds.includes(vehicle.id)}
                    onChange={() =>
                      updateTrip({
                        ...trip,
                        vehicleIds: trip.vehicleIds.includes(vehicle.id)
                          ? trip.vehicleIds.filter((x) => x !== vehicle.id)
                          : [...trip.vehicleIds, vehicle.id],
                      })
                    }
                  />
                  <span className="chip__label">{vehicle.name}</span>
                </label>
              </li>
            ))}
          </ul>

          <h4 className="editor__subtitle">Racks fitted</h4>
          <ul className="chips">
            {[...new Set(library.vehicles.flatMap((v) => v.racks))].map((rack) => (
              <li key={rack} className="chips__item">
                <label className={trip.rackIds.includes(rack) ? 'chip is-on' : 'chip'}>
                  <input
                    type="checkbox"
                    checked={trip.rackIds.includes(rack)}
                    onChange={() =>
                      updateTrip({
                        ...trip,
                        rackIds: trip.rackIds.includes(rack)
                          ? trip.rackIds.filter((x) => x !== rack)
                          : [...trip.rackIds, rack],
                      })
                    }
                  />
                  <span className="chip__label">{rack.replace(/-/g, ' ')}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="editor__note">
            These drive rules rather than decorate the screen: the kayak rack gates the boat and the
            bike rack gates the bikes. Take the rack off and the boat comes off the list.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  section,
  fields,
  library,
  packingIds,
  onEditItem,
  children,
}: {
  title: string;
  section: string;
  fields: InfoField[];
  library: Parameters<typeof InfoButton>[0]['library'];
  packingIds: Set<string>;
  onEditItem: (itemId: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {fields.length > 0 && (
          <InfoButton
            section={section}
            fields={fields}
            library={library}
            packingIds={packingIds}
            onEditItem={onEditItem}
          />
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The +4 / −2 banner. Shown when trip inputs change, because that is how the
 * model becomes something you understand rather than something you trust.
 */
function useLiveDiff(result: ReturnType<typeof buildList> | null): ListDiff | null {
  const previous = useRef(result);
  const [diff, setDiff] = useState<ListDiff | null>(null);

  useEffect(() => {
    if (!result) return;
    const before = previous.current;
    previous.current = result;
    if (!before || before === result) return;

    const next = diffLists(before, result);
    if (next.summary === 'no change') return;
    setDiff(next);
    const timer = setTimeout(() => setDiff(null), 9000);
    return () => clearTimeout(timer);
  }, [result]);

  return diff;
}
