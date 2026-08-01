import { useState } from 'react';
import { useStore } from '../state/store';
import { counterId } from '../data/ids';
import { fetchWeather, type WeatherProposal } from '../engine/weather';
import {
  PRECIPS,
  SITE_QUESTIONS,
  SITE_QUESTION_LABELS,
  type Precip,
  type Trip,
} from '../data/types';

/**
 * The site questionnaire is standardised yes/no rather than free-form tags, so
 * that both answers are usable by rules — "there are no flush toilets" has to
 * be expressible, and it is what puts the trowel on the list.
 *
 * Unknown defaults to no, which is the safe direction to be wrong in.
 */
export function SiteQuestions({ trip }: { trip: Trip }) {
  const { updateTrip } = useStore();

  return (
    <div className="editor">
      <ul className="questions">
        {SITE_QUESTIONS.map((question) => {
          const answer = trip.site[question] ?? false;
          const unanswered = trip.site[question] === undefined;
          return (
            <li key={question} className="question">
              <span className="question__text">
                {SITE_QUESTION_LABELS[question]}
                {unanswered && <span className="question__default">assumed no</span>}
              </span>
              <div className="segmented segmented--sm" role="group" aria-label={SITE_QUESTION_LABELS[question]}>
                <button
                  type="button"
                  className={answer ? 'segmented__btn is-active' : 'segmented__btn'}
                  aria-pressed={answer}
                  onClick={() => updateTrip({ ...trip, site: { ...trip.site, [question]: true } })}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={!answer && !unanswered ? 'segmented__btn is-active' : 'segmented__btn'}
                  aria-pressed={!answer && !unanswered}
                  onClick={() => updateTrip({ ...trip, site: { ...trip.site, [question]: false } })}
                >
                  No
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="editor__note">
        Anything you have not answered counts as no. That is the direction that packs the trowel and
        the water jugs rather than leaving them behind.
      </p>
    </div>
  );
}

/**
 * Sleeping arrangement. One six-person tent versus two tents changes the
 * shelter count, and with it the pad count and the lantern count.
 */
export function ShelterEditor({ trip }: { trip: Trip }) {
  const { library, updateTrip } = useStore();
  const attendees = library.people.filter((p) => trip.attendeeIds.includes(p.id));
  const unassigned = attendees.filter(
    (p) => !trip.shelters.some((s) => s.occupantIds.includes(p.id)),
  );

  const addShelter = () => {
    const id = counterId('sh', trip.shelters.map((s) => s.id));
    updateTrip({
      ...trip,
      shelters: [...trip.shelters, { id, name: `Shelter ${trip.shelters.length + 1}`, occupantIds: [] }],
    });
  };

  const move = (personId: string, shelterId: string | null) =>
    updateTrip({
      ...trip,
      shelters: trip.shelters.map((s) => ({
        ...s,
        occupantIds:
          s.id === shelterId
            ? [...s.occupantIds.filter((x) => x !== personId), personId]
            : s.occupantIds.filter((x) => x !== personId),
      })),
    });

  return (
    <div className="editor">
      <ul className="shelters">
        {trip.shelters.map((shelter) => (
          <li key={shelter.id} className="shelter">
            <div className="shelter__head">
              <input
                type="text"
                className="input input--inline"
                value={shelter.name}
                aria-label="Shelter name"
                onChange={(e) =>
                  updateTrip({
                    ...trip,
                    shelters: trip.shelters.map((s) =>
                      s.id === shelter.id ? { ...s, name: e.target.value } : s,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  updateTrip({ ...trip, shelters: trip.shelters.filter((s) => s.id !== shelter.id) })
                }
              >
                Remove
              </button>
            </div>
            <ul className="shelter__people">
              {attendees.map((person) => (
                <li key={person.id}>
                  <label className={shelter.occupantIds.includes(person.id) ? 'chip is-on' : 'chip'}>
                    <input
                      type="checkbox"
                      checked={shelter.occupantIds.includes(person.id)}
                      onChange={() =>
                        move(person.id, shelter.occupantIds.includes(person.id) ? null : shelter.id)
                      }
                    />
                    <span className="chip__label">{person.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="editor__add">
        <button type="button" className="btn" onClick={addShelter}>
          Add a shelter
        </button>
        <span className="editor__impact">
          {trip.shelters.length} shelter{trip.shelters.length === 1 ? '' : 's'} — tents, footprints
          and lanterns count from this.
        </span>
      </div>

      {unassigned.length > 0 && (
        <p className="notice notice--bad" role="status">
          {unassigned.map((p) => p.name).join(', ')} {unassigned.length === 1 ? 'has' : 'have'} no
          shelter.
        </p>
      )}
    </div>
  );
}

/**
 * Weather. Fetch is an explicit action and its result is a proposal you accept
 * or reject — never a silent overwrite of a rule input. See ADR-008.
 */
export function WeatherSection({ trip }: { trip: Trip }) {
  const { updateTrip } = useStore();
  const [proposal, setProposal] = useState<WeatherProposal | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<Trip['weather']>) =>
    updateTrip({ ...trip, weather: { ...trip.weather, ...patch } });

  const fetchIt = async () => {
    if (!trip.location.trim()) {
      setStatus('Enter a location first.');
      return;
    }
    setBusy(true);
    setStatus(null);
    setProposal(null);
    try {
      const result = await fetchWeather(trip.location, trip.startDate, trip.endDate, trip.weather);
      if (result.changes.length === 0) {
        setStatus(`${result.source} agrees with what you have entered. Nothing to change.`);
      } else {
        setProposal(result);
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor">
      <div className="fields">
        <label className="field">
          <span className="field__label">Precipitation</span>
          <select
            className="input"
            value={trip.weather.precip}
            onChange={(e) => set({ precip: e.target.value as Precip })}
          >
            {PRECIPS.map((precip) => (
              <option key={precip} value={precip}>
                {precip}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Overnight low °C</span>
          <input
            type="number"
            className="input"
            value={trip.weather.overnightLow}
            onChange={(e) => set({ overnightLow: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span className="field__label">Daytime high °C</span>
          <input
            type="number"
            className="input"
            value={trip.weather.daytimeHigh}
            onChange={(e) => set({ daytimeHigh: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span className="field__label">Wind km/h</span>
          <input
            type="number"
            className="input"
            value={trip.weather.windKph}
            onChange={(e) => set({ windKph: Number(e.target.value) })}
          />
          <span className="field__hint">
            Wind decides the tarp and the paddle more than rain does.
          </span>
        </label>
      </div>

      <div className="editor__add">
        <button type="button" className="btn" onClick={() => void fetchIt()} disabled={busy}>
          {busy ? 'Fetching…' : 'Fetch the forecast'}
        </button>
        <span className="editor__impact">
          Shown as a proposal. Nothing changes until you accept it.
        </span>
      </div>

      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}

      {proposal && (
        <div className="proposal" role="status">
          <h4 className="proposal__title">{proposal.source} suggests:</h4>
          <ul className="proposal__changes">
            {proposal.changes.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
          <div className="editor__add">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                updateTrip({ ...trip, weather: proposal.weather });
                setProposal(null);
                setStatus('Applied. Check the list diff to see what it moved.');
              }}
            >
              Apply
            </button>
            <button type="button" className="btn" onClick={() => setProposal(null)}>
              Keep mine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
