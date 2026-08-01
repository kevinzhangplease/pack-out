import { useState } from 'react';
import { useStore } from '../state/store';
import { deletePerson, deletionImpact, upsertPerson } from '../engine/mutations';
import { uniqueId } from '../data/ids';
import { ROLES, type Person, type Role, type Trip } from '../data/types';

const ROLE_NOTES: Record<Role, string> = {
  adult: 'Full portions. Carries group gear.',
  kid: '0.7 eater units. Own short list.',
  toddler: '0.5 eater units. Pulls diapers, sleep sack, comfort object.',
};

/**
 * People are fully editable and nothing in the default library names one —
 * roles carry all the behaviour. Roles change fast, so changing one is a single
 * dropdown rather than an edit to any rule.
 */
export function PeopleEditor({ trip }: { trip: Trip }) {
  const { library, setLibrary, updateTrip } = useStore();
  const [newName, setNewName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const toggleAttending = (id: string) => {
    const attending = trip.attendeeIds.includes(id);
    updateTrip({
      ...trip,
      attendeeIds: attending
        ? trip.attendeeIds.filter((x) => x !== id)
        : [...trip.attendeeIds, id],
      // Somebody who is not going cannot be sleeping in a shelter.
      shelters: attending
        ? trip.shelters.map((s) => ({ ...s, occupantIds: s.occupantIds.filter((x) => x !== id) }))
        : trip.shelters,
    });
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const person: Person = {
      id: uniqueId('p', name, library.people.map((p) => p.id)),
      name,
      role: 'adult',
    };
    setLibrary(upsertPerson(library, person), `add ${name}`);
    updateTrip({ ...trip, attendeeIds: [...trip.attendeeIds, person.id] });
    setNewName('');
  };

  const remove = (person: Person) => {
    const result = deletePerson(library, person.id);
    setLibrary(result.library, `delete ${person.name}`);
    updateTrip({
      ...trip,
      attendeeIds: trip.attendeeIds.filter((x) => x !== person.id),
      shelters: trip.shelters.map((s) => ({
        ...s,
        occupantIds: s.occupantIds.filter((x) => x !== person.id),
      })),
    });
    setConfirming(null);
  };

  return (
    <div className="editor">
      <ul className="editor__rows">
        {library.people.map((person) => {
          const impact = deletionImpact(library, 'person', person.id);
          return (
            <li key={person.id} className="editor__row">
              <label className="check-inline check-inline--grow">
                <input
                  type="checkbox"
                  checked={trip.attendeeIds.includes(person.id)}
                  onChange={() => toggleAttending(person.id)}
                />
                <input
                  type="text"
                  className="input input--inline"
                  value={person.name}
                  aria-label={`Name for ${person.name}`}
                  onChange={(e) =>
                    setLibrary(
                      upsertPerson(library, { ...person, name: e.target.value }),
                      `rename ${person.name}`,
                    )
                  }
                />
              </label>

              <select
                className="input input--inline"
                value={person.role}
                aria-label={`Role for ${person.name}`}
                title={ROLE_NOTES[person.role]}
                onChange={(e) =>
                  setLibrary(
                    upsertPerson(library, { ...person, role: e.target.value as Role }),
                    `change ${person.name} to ${e.target.value}`,
                  )
                }
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <details className="person__detail">
                <summary>Medical and weight</summary>
                <div className="fields">
                  <label className="field">
                    <span className="field__label">Allergies</span>
                    <input
                      type="text"
                      className="input"
                      placeholder="nuts, dairy"
                      value={(person.allergies ?? []).join(', ')}
                      onChange={(e) =>
                        setLibrary(
                          upsertPerson(library, {
                            ...person,
                            allergies: e.target.value
                              .split(',')
                              .map((a) => a.trim())
                              .filter(Boolean),
                          }),
                          `set allergies for ${person.name}`,
                        )
                      }
                    />
                    <span className="field__hint">
                      Checked against every ingredient on the meal plan and printed on the trip plan.
                    </span>
                  </label>
                  <label className="field">
                    <span className="field__label">Medications</span>
                    <input
                      type="text"
                      className="input"
                      value={(person.medications ?? []).join(', ')}
                      onChange={(e) =>
                        setLibrary(
                          upsertPerson(library, {
                            ...person,
                            medications: e.target.value
                              .split(',')
                              .map((m) => m.trim())
                              .filter(Boolean),
                          }),
                          `set medications for ${person.name}`,
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Body weight (kg)</span>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={person.bodyWeight_kg ?? ''}
                      onChange={(e) =>
                        setLibrary(
                          upsertPerson(library, {
                            ...person,
                            bodyWeight_kg: e.target.value ? Number(e.target.value) : undefined,
                          }),
                          `set body weight for ${person.name}`,
                        )
                      }
                    />
                    <span className="field__hint">
                      Only the shakedown pass reads this. Without it the pass has to guess.
                    </span>
                  </label>
                  <label className="field">
                    <span className="field__label">Appetite</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="input"
                      value={person.appetite ?? 1}
                      onChange={(e) =>
                        setLibrary(
                          upsertPerson(library, { ...person, appetite: Number(e.target.value) }),
                          `set appetite for ${person.name}`,
                        )
                      }
                    />
                    <span className="field__hint">
                      Multiplies their role s eater unit. 1 means as expected.
                    </span>
                  </label>
                </div>
              </details>

              {confirming === person.id ? (
                <span className="editor__confirm">
                  <span className="editor__impact">
                    {impact.orphaned > 0
                      ? `${impact.orphaned} item${impact.orphaned === 1 ? '' : 's'} would be orphaned.`
                      : 'No rules name them.'}
                  </span>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(person)}>
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
                  onClick={() => setConfirming(person.id)}
                  aria-label={`Delete ${person.name}`}
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="editor__add">
        <input
          type="text"
          className="input"
          placeholder="Add a person"
          value={newName}
          aria-label="Name of the person to add"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button type="button" className="btn" onClick={add}>
          Add
        </button>
      </div>
      <p className="editor__note">
        Roles do the work, not names. A new person starts as an adult; change the role and every
        role-based rule follows immediately.
      </p>
    </div>
  );
}
