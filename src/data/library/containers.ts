import type { Container } from '../types';

/**
 * Containers are physical: a bin you can lift, a bag you can find in the dark.
 * `loadZone` is where it rides — the top-down load plan reads it.
 */
export const CONTAINERS: Container[] = [
  { id: 'shelter-bag', name: 'Shelter bag', loadZone: 'rear-floor' },
  { id: 'sleep-duffel', name: 'Sleep duffel', loadZone: 'rear-top' },
  { id: 'kitchen-bin', name: 'Kitchen bin', loadZone: 'rear-floor' },
  { id: 'pantry-box', name: 'Pantry box', loadZone: 'rear-floor' },
  { id: 'cooler', name: 'Cooler', loadZone: 'rear-door' },
  { id: 'water', name: 'Water jugs', loadZone: 'rear-floor' },
  { id: 'clothing-duffel', name: 'Clothing duffel', loadZone: 'rear-top' },
  { id: 'personal-pack', name: 'Personal pack', loadZone: 'cabin' },
  { id: 'day-pack', name: 'Day pack', loadZone: 'cabin' },
  { id: 'first-aid', name: 'First aid kit', loadZone: 'cabin' },
  { id: 'bear-cache', name: 'Bear storage', loadZone: 'rear-door' },
  { id: 'tool-box', name: 'Tool box', loadZone: 'under-floor' },
  { id: 'dry-bag', name: 'Dry bags', loadZone: 'boat' },
  { id: 'roof-box', name: 'Roof box', loadZone: 'roof' },
  { id: 'vehicle', name: 'Lives in the vehicle', loadZone: 'under-floor' },
  { id: 'not-packed', name: 'Not packed — a task', note: 'Actions live on the timeline.' },
];
