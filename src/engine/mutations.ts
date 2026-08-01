import type { Activity, Cond, Id, Item, Library, Person, SetField, Vehicle } from '../data/types';

/**
 * Library edits that have to preserve an invariant.
 *
 * Deleting a trigger is the dangerous one. Stripping a deleted activity out of
 * every rule can leave an item with no conditions at all, and in the version
 * this replaces such an item silently promoted itself onto every trip. Here it
 * is marked `orphaned` instead: excluded from every list, surfaced in the
 * library health panel, and waiting to be repaired. See ADR-001.
 */

export interface RemovalResult {
  library: Library;
  /** Items whose rules were edited, for the "here is what that did" message. */
  touched: Item[];
  /** Items left with no conditions and quarantined. */
  orphaned: Item[];
}

function stripValue(cond: Cond, field: SetField, value: Id): Cond | null {
  if (cond.kind === 'group') {
    const conds = cond.conds
      .map((c) => stripValue(c, field, value))
      .filter((c): c is Exclude<Cond, { kind: 'group' }> => c !== null && c.kind !== 'group');
    // A group that lost every branch is gone, not vacuously true.
    return conds.length ? { ...cond, conds } : null;
  }
  if (cond.kind !== 'set' || cond.field !== field) return cond;
  const values = cond.values.filter((v) => v !== value);
  return values.length ? { ...cond, values } : null;
}

function removeTrigger(library: Library, field: SetField, value: Id): RemovalResult {
  const touched: Item[] = [];
  const orphaned: Item[] = [];

  const items = library.items.map((item) => {
    const conds = item.rule.conds
      .map((c) => stripValue(c, field, value))
      .filter((c): c is Cond => c !== null);

    if (conds.length === item.rule.conds.length) {
      const unchanged = JSON.stringify(conds) === JSON.stringify(item.rule.conds);
      if (unchanged) return item;
    }

    if (conds.length === 0) {
      const next: Item = { ...item, orphaned: true };
      orphaned.push(next);
      // The rule is kept exactly as it was so the repair screen can show what
      // the item used to depend on. It is the `orphaned` flag that excludes it.
      return next;
    }

    const next: Item = {
      ...item,
      rule: { ...item.rule, conds: conds as [Cond, ...Cond[]] },
    };
    touched.push(next);
    return next;
  });

  return { library: { ...library, items }, touched, orphaned };
}

export function deleteActivity(library: Library, activityId: Id): RemovalResult {
  const result = removeTrigger(library, 'activity', activityId);
  result.library = {
    ...result.library,
    activities: result.library.activities.filter((a) => a.id !== activityId),
  };
  return result;
}

export function deletePerson(library: Library, personId: Id): RemovalResult {
  const result = removeTrigger(library, 'person', personId);
  result.library = {
    ...result.library,
    people: result.library.people.filter((p) => p.id !== personId),
  };
  return result;
}

export function deleteVehicle(library: Library, vehicleId: Id): RemovalResult {
  const result = removeTrigger(library, 'vehicle', vehicleId);
  result.library = {
    ...result.library,
    vehicles: result.library.vehicles.filter((v) => v.id !== vehicleId),
  };
  return result;
}

// ---------------------------------------------------------------------------
// Plain additions and edits
// ---------------------------------------------------------------------------

export function upsertPerson(library: Library, person: Person): Library {
  const exists = library.people.some((p) => p.id === person.id);
  return {
    ...library,
    people: exists
      ? library.people.map((p) => (p.id === person.id ? person : p))
      : [...library.people, person],
  };
}

export function upsertActivity(library: Library, activity: Activity): Library {
  const exists = library.activities.some((a) => a.id === activity.id);
  return {
    ...library,
    activities: exists
      ? library.activities.map((a) => (a.id === activity.id ? activity : a))
      : [...library.activities, activity],
  };
}

export function upsertVehicle(library: Library, vehicle: Vehicle): Library {
  const exists = library.vehicles.some((v) => v.id === vehicle.id);
  return {
    ...library,
    vehicles: exists
      ? library.vehicles.map((v) => (v.id === vehicle.id ? vehicle : v))
      : [...library.vehicles, vehicle],
  };
}

export function upsertItem(library: Library, item: Item): Library {
  const exists = library.items.some((i) => i.id === item.id);
  return {
    ...library,
    items: exists ? library.items.map((i) => (i.id === item.id ? item : i)) : [...library.items, item],
  };
}

/** How many items would break if this trigger went away. Shown before deleting. */
export function deletionImpact(
  library: Library,
  field: SetField,
  value: Id,
): { touched: number; orphaned: number } {
  const result = removeTrigger(library, field, value);
  return { touched: result.touched.length, orphaned: result.orphaned.length };
}
