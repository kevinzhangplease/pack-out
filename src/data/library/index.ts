import type { Library } from '../types';
import { SCHEMA_VERSION } from '../schema';
import { CONTAINERS } from './containers';
import { ACTIVITIES, SEED_PEOPLE, SEED_VEHICLES } from './activities';
import { SHELTER_SLEEP_ITEMS } from './items-shelter-sleep';
import { KITCHEN_WATER_ITEMS } from './items-kitchen-water';
import { CLOTHING_HYGIENE_ITEMS } from './items-clothing-hygiene';
import { SAFETY_NAV_ITEMS } from './items-safety-nav';
import { KIDS_BOAT_ITEMS } from './items-kids-boat';
import { ACTION_ITEMS } from './items-actions';

export const DEFAULT_ITEMS = [
  ...SHELTER_SLEEP_ITEMS,
  ...KITCHEN_WATER_ITEMS,
  ...CLOTHING_HYGIENE_ITEMS,
  ...SAFETY_NAV_ITEMS,
  ...KIDS_BOAT_ITEMS,
  ...ACTION_ITEMS,
];

export function defaultLibrary(): Library {
  // Deep clone so the caller can edit freely without mutating the defaults.
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    items: DEFAULT_ITEMS,
    containers: CONTAINERS,
    activities: ACTIVITIES,
    people: SEED_PEOPLE,
    vehicles: SEED_VEHICLES,
  });
}

export { CONTAINERS, ACTIVITIES, SEED_PEOPLE, SEED_VEHICLES };
