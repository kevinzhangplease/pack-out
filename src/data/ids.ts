/**
 * Deterministic IDs.
 *
 * `Date.now()` collides when two things are created in the same millisecond —
 * which happens constantly when seeding, importing, or duplicating a day of a
 * meal plan. Instead: a slug derived from the name, plus a monotonic counter
 * seeded from what already exists, so ids are stable, readable, and diffable.
 */

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'x'
  );
}

/**
 * A slug unique within `existing`. Collisions get a numeric suffix rather than
 * a random one, so re-running the same import twice produces the same ids.
 */
export function uniqueId(prefix: string, name: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base = `${prefix}-${slugify(name)}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** For objects with no natural name, e.g. a shelter or a meal slot. */
export function counterId(prefix: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}
