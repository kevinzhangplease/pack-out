import { migrate, SCHEMA_VERSION } from '../data/schema';

/**
 * Three lifetimes, three storage keys. Conflating them causes real bugs — the
 * one this specifically prevents is checkboxes bleeding between trips, which
 * happens the moment session state shares a key with trip state.
 */
export const KEYS = {
  library: 'packout.library.v1',
  trips: 'packout.trips.v1',
  /** Session state is per trip. The trip id is part of the key, deliberately. */
  session: (tripId: string) => `packout.session.${tripId}`,
  ui: 'packout.ui.v1',
} as const;

function available(): Storage | null {
  try {
    const probe = '__packout__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function load<T>(key: string, fallback: T, runMigrations = false): T {
  const store = available();
  if (!store) return fallback;
  const raw = store.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (runMigrations && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return migrate<T & { schemaVersion?: number }>(parsed).data as T;
    }
    return parsed as T;
  } catch {
    // Never lose the bad data: park it so it can be recovered by hand.
    try {
      store.setItem(`${key}.corrupt.${Date.now()}`, raw);
    } catch {
      /* out of quota; the original is still in place */
    }
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  const store = available();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota exceeded. The in-memory state is still correct; the export
       button in the error boundary is the recovery path. */
  }
}

export function remove(key: string): void {
  available()?.removeItem(key);
}

/**
 * Everything in storage, for the error boundary's "export my data" button.
 * Deliberately raw: if the app is broken enough to hit the boundary, parsing
 * is exactly what we should not be relying on.
 */
export function dumpEverything(): string {
  const store = available();
  const out: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION, raw: {} };
  if (!store) return JSON.stringify(out, null, 2);
  const raw: Record<string, string> = {};
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith('packout.')) raw[key] = store.getItem(key) ?? '';
  }
  out.raw = raw;
  return JSON.stringify(out, null, 2);
}
