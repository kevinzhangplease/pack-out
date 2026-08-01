import type { Activity, Person, Vehicle } from '../types';

export const ACTIVITIES: Activity[] = [
  { id: 'hiking', name: 'Hiking', minRole: 'kid', rainyAlternate: 'Short loop in rain gear, then hot drinks' },
  { id: 'swimming', name: 'Swimming', minRole: 'kid', rainyAlternate: 'Skip — cold water plus rain is a bad combination' },
  { id: 'paddling', name: 'Paddling', minRole: 'kid', rainyAlternate: 'Shore day; wind matters more than rain' },
  { id: 'fishing', name: 'Fishing', minRole: 'kid', rainyAlternate: 'Still good in rain' },
  { id: 'biking', name: 'Biking', minRole: 'kid', rainyAlternate: 'Skip — wet roots and brakes' },
  { id: 'beach', name: 'Beach', minRole: 'toddler', rainyAlternate: 'Tide pools in rain gear' },
  { id: 'campfire', name: 'Campfire', minRole: 'toddler', rainyAlternate: 'Under the tarp, if there is no fire ban' },
  { id: 'stargazing', name: 'Stargazing', minRole: 'kid', rainyAlternate: 'Card games in the tent' },
  { id: 'board-games', name: 'Games', minRole: 'toddler' },
  { id: 'foraging', name: 'Foraging', minRole: 'kid', rainyAlternate: 'Better in rain, actually' },
  { id: 'climbing', name: 'Climbing', minRole: 'adult', rainyAlternate: 'Skip' },
  { id: 'snowshoeing', name: 'Snowshoeing', minRole: 'kid' },
];

/**
 * Seed people only. Nothing in the rule library names a person — roles carry
 * all the behaviour, so deleting every one of these leaves the library intact.
 */
export const SEED_PEOPLE: Person[] = [
  { id: 'p-adult-1', name: 'Adult 1', role: 'adult' },
  { id: 'p-adult-2', name: 'Adult 2', role: 'adult' },
  { id: 'p-kid-1', name: 'Kid 1', role: 'kid' },
  { id: 'p-kid-2', name: 'Kid 2', role: 'toddler' },
];

export const SEED_VEHICLES: Vehicle[] = [
  { id: 'v-minivan', name: 'Minivan', racks: ['roof-rack', 'hitch-rack', 'kayak-rack', 'bike-rack'] },
];

export const RACKS = ['roof-rack', 'hitch-rack', 'kayak-rack', 'bike-rack', 'roof-box'] as const;
