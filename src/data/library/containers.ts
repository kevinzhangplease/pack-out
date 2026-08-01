import type { Container } from '../types';

/**
 * Containers are physical: a bin you can lift, a bag you can find in the dark.
 *
 * `zones` says where each one rides under each transport. A vehicle trip and a
 * kayak trip are different loading problems, and you often drive to a trailhead
 * and do both on the same day — so the container knows both answers rather than
 * the app guessing.
 *
 * Vehicle zones follow one rule: heavy, low and forward.
 */
export const CONTAINERS: Container[] = [
  {
    id: 'shelter-bag',
    name: 'Shelter bag',
    zones: { vehicle: 'boot-front', carried: 'outside', boat: 'bow' },
  },
  {
    id: 'sleep-duffel',
    name: 'Sleep duffel',
    zones: { vehicle: 'boot-rear', carried: 'bottom', boat: 'bow' },
  },
  {
    id: 'kitchen-bin',
    name: 'Kitchen bin',
    zones: { vehicle: 'boot-front', carried: 'core', boat: 'stern' },
    note: 'Heavy. Goes in first, against the seats.',
  },
  {
    id: 'pantry-box',
    name: 'Pantry box',
    zones: { vehicle: 'boot-front', carried: 'core', boat: 'stern' },
  },
  {
    id: 'cooler',
    name: 'Cooler',
    zones: { vehicle: 'boot-rear', carried: 'core', boat: 'stern' },
    note: 'At the tailgate. You will open it before anything else is unpacked.',
  },
  {
    id: 'water',
    name: 'Water jugs',
    zones: { vehicle: 'boot-front', carried: 'core', boat: 'stern' },
    note: 'Twenty litres is twenty kilos. As low and as far forward as it will go.',
  },
  {
    id: 'clothing-duffel',
    name: 'Clothing duffel',
    zones: { vehicle: 'boot-rear', carried: 'bottom', boat: 'bow' },
  },
  {
    id: 'personal-pack',
    name: 'Personal pack',
    zones: { vehicle: 'cabin-rear', carried: 'core', boat: 'bow' },
  },
  {
    id: 'day-pack',
    name: 'Day pack',
    zones: { vehicle: 'cabin-rear', carried: 'lid', boat: 'cockpit' },
  },
  {
    id: 'first-aid',
    name: 'First aid kit',
    zones: { vehicle: 'cabin-front', carried: 'lid', boat: 'day-hatch' },
    note: 'Reachable without unpacking anything. That is the whole point of it.',
  },
  {
    id: 'bear-cache',
    name: 'Bear storage',
    zones: { vehicle: 'boot-rear', carried: 'core', boat: 'stern' },
  },
  {
    id: 'tool-box',
    name: 'Tool box',
    zones: { vehicle: 'under-floor', carried: 'core', boat: 'stern' },
  },
  {
    id: 'dry-bag',
    name: 'Dry bags',
    zones: { vehicle: 'boot-rear', carried: 'bottom', boat: 'bow' },
  },
  {
    id: 'roof-box',
    name: 'Roof box',
    zones: { vehicle: 'roof', carried: 'outside', boat: 'deck' },
  },
  {
    id: 'vehicle',
    name: 'Lives in the vehicle',
    zones: { vehicle: 'under-floor' },
  },
  { id: 'not-packed', name: 'Not packed — a task', note: 'Actions live on the timeline.' },
];
