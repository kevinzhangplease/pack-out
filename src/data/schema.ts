import type { Library, Trip } from './types';

/**
 * Schema version and an ordered migration chain, from day one.
 *
 * Rules for adding a migration:
 *  - bump SCHEMA_VERSION,
 *  - append one entry to MIGRATIONS with `to` equal to the new version,
 *  - never edit an existing migration, and never reorder them.
 *
 * Migrations take `unknown` and return `unknown` on purpose: they operate on
 * data written by an older version of the app, which by definition does not
 * match today's types.
 */
export const SCHEMA_VERSION = 5;

export interface Migration {
  to: number;
  describe: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

export const MIGRATIONS: Migration[] = [
  {
    to: 2,
    describe: 'added the meal plan, the meal library and pantry stock',
    migrate(data) {
      const library = data.library as Record<string, unknown> | undefined;
      if (library) {
        // A v1 library had no meals. It gets an empty one rather than the
        // shipped defaults: silently injecting twenty meals into somebody's
        // curated library would be a worse surprise than an empty meal screen.
        if (!Array.isArray(library.meals)) library.meals = [];
        if (!library.pantry || typeof library.pantry !== 'object') library.pantry = {};
      }
      const trips = data.trips;
      if (Array.isArray(trips)) {
        for (const trip of trips as Record<string, unknown>[]) {
          if (!Array.isArray(trip.mealPlan)) trip.mealPlan = [];
        }
      }
      // A bare library export, rather than a full backup.
      if (!library && Array.isArray(data.items)) {
        if (!Array.isArray(data.meals)) data.meals = [];
        if (!data.pantry || typeof data.pantry !== 'object') data.pantry = {};
      }
      return data;
    },
  },
  {
    to: 3,
    describe: 'added load zones, packing responsibility and the left-behind list',
    migrate(data) {
      const library = data.library as Record<string, unknown> | undefined;
      const containers = (library?.containers ?? data.containers) as
        | Record<string, unknown>[]
        | undefined;
      if (Array.isArray(containers)) {
        for (const container of containers) {
          if (container.zones || typeof container.loadZone !== 'string') continue;
          // v2 had one loadZone string with no transport. Map the old vehicle
          // names onto the new footprint zones and leave the rest unassigned,
          // which the load plan surfaces rather than guessing at.
          const legacy: Record<string, string> = {
            'rear-floor': 'boot-front',
            'rear-top': 'boot-rear',
            'rear-door': 'boot-rear',
            cabin: 'cabin-rear',
            roof: 'roof',
            'under-floor': 'under-floor',
            boat: 'bow',
          };
          const mapped = legacy[container.loadZone as string];
          if (mapped) container.zones = { vehicle: mapped };
          delete container.loadZone;
        }
      }
      const trips = data.trips;
      if (Array.isArray(trips)) {
        for (const trip of trips as Record<string, unknown>[]) {
          if (!trip.packedBy || typeof trip.packedBy !== 'object') trip.packedBy = {};
          if (!Array.isArray(trip.leftBehind)) trip.leftBehind = [];
        }
      }
      return data;
    },
  },
  {
    to: 4,
    describe: 'added the trip plan, jurisdiction, camp roles and household coverage',
    migrate(data) {
      const trips = data.trips;
      if (Array.isArray(trips)) {
        for (const trip of trips as Record<string, unknown>[]) {
          if (!trip.coveredBy || typeof trip.coveredBy !== 'object') trip.coveredBy = {};
          if (!Array.isArray(trip.households)) trip.households = [];
          if (!Array.isArray(trip.campRoles)) trip.campRoles = [];
          if (typeof trip.jurisdiction !== 'string') trip.jurisdiction = 'unknown';
          if (!trip.plan || typeof trip.plan !== 'object') {
            trip.plan = {
              routeNotes: '',
              bailOutPoints: '',
              nearestHospital: '',
              contactName: '',
              contactPhone: '',
              overdue: '',
            };
          }
        }
      }
      // coveredBy moved from the library to the trip, because who brings the
      // stove is a fact about one weekend rather than a property of the stove.
      const library = data.library as Record<string, unknown> | undefined;
      const items = (library?.items ?? data.items) as Record<string, unknown>[] | undefined;
      if (Array.isArray(items)) {
        for (const item of items) delete item.coveredBy;
      }
      return data;
    },
  },
  {
    to: 5,
    describe: 'added post-trip reviews and dismissed rule proposals',
    migrate(data) {
      const trips = data.trips;
      if (Array.isArray(trips)) {
        for (const trip of trips as Record<string, unknown>[]) {
          if (!trip.review || typeof trip.review !== 'object') trip.review = { entries: [] };
        }
      }
      const library = data.library as Record<string, unknown> | undefined;
      const target = library ?? (Array.isArray(data.items) ? data : undefined);
      if (target && !Array.isArray(target.dismissedProposals)) target.dismissedProposals = [];
      return data;
    },
  },
];

export interface MigrationResult<T> {
  data: T;
  applied: string[];
  fromVersion: number;
}

export function migrate<T extends { schemaVersion?: number }>(
  raw: Record<string, unknown>,
): MigrationResult<T> {
  const fromVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `This data was written by a newer version of Pack Out (schema ${fromVersion}, this build understands ${SCHEMA_VERSION}). Update the app before importing, or you will lose fields.`,
    );
  }

  let data = raw;
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.to <= fromVersion) continue;
    data = migration.migrate(data);
    data.schemaVersion = migration.to;
    applied.push(migration.describe);
  }
  data.schemaVersion = SCHEMA_VERSION;

  return { data: data as unknown as T, applied, fromVersion };
}

// ---------------------------------------------------------------------------
// Export / import — insurance on the only thing in this app with real value.
// ---------------------------------------------------------------------------

export interface Backup {
  schemaVersion: number;
  exportedAt: string;
  library: Library;
  trips: Trip[];
}

export function makeBackup(library: Library, trips: Trip[], nowISO: string): Backup {
  return { schemaVersion: SCHEMA_VERSION, exportedAt: nowISO, library, trips };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(json: string): MigrationResult<Backup> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON. Nothing was changed.');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('That file does not look like a Pack Out backup. Nothing was changed.');
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.library || typeof obj.library !== 'object') {
    throw new Error('That backup has no library in it. Nothing was changed.');
  }

  const result = migrate<Backup>(obj);
  if (!Array.isArray(result.data.trips)) result.data.trips = [];
  return result;
}
