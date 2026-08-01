import type { MealPlanEntry, Trip, TripPlan } from './types';

const BLANK_PLAN: TripPlan = {
  routeNotes: '',
  bailOutPoints: '',
  nearestHospital: '',
  contactName: '',
  contactPhone: '',
  overdue: '',
};

/**
 * A real three-night plan: trivial arrival dinner (frozen chili, one pot, which
 * is also the ice), one fire meal, one project meal, and a leftovers lunch
 * linked to the dinner that produced it.
 */
const FAMILY_MEAL_PLAN: MealPlanEntry[] = [
  { id: 'mp-1', dayIndex: 0, slot: 'dinner', mealId: 'meal-chili' },
  { id: 'mp-2', dayIndex: 1, slot: 'breakfast', mealId: 'meal-eggs-bacon' },
  { id: 'mp-3', dayIndex: 1, slot: 'lunch', mealId: 'meal-leftovers', leftoversFrom: 'mp-1' },
  { id: 'mp-4', dayIndex: 1, slot: 'dinner', mealId: 'meal-foil-salmon' },
  { id: 'mp-5', dayIndex: 1, slot: 'snack', mealId: 'meal-smores' },
  { id: 'mp-6', dayIndex: 2, slot: 'breakfast', mealId: 'meal-pancakes' },
  { id: 'mp-7', dayIndex: 2, slot: 'lunch', mealId: 'meal-sandwiches' },
  { id: 'mp-8', dayIndex: 2, slot: 'dinner', mealId: 'meal-tacos' },
  { id: 'mp-9', dayIndex: 3, slot: 'breakfast', mealId: 'meal-bagels' },
];

/**
 * Golden fixture trips. These are the trips the engine is tested against, and
 * they are deliberately concrete: a real July weekend at a BC Parks site, a real
 * shoulder-season solo, a real winter hike-in, a real paddle. Plus the degenerate
 * cases, because those are where list generators quietly do the wrong thing.
 */

export const FAMILY_CAR_SUMMER: Trip = {
  id: 'fixture-family-summer',
  name: 'Family car camping, July',
  startDate: '2026-07-10',
  endDate: '2026-07-13',
  location: 'Porteau Cove, BC',
  driveHours: 1.5,
  style: 'car-camping',
  weather: { precip: 'possible', overnightLow: 13, daytimeHigh: 24, windKph: 12 },
  attendeeIds: ['p-adult-1', 'p-adult-2', 'p-kid-1', 'p-kid-2'],
  activityIds: ['swimming', 'beach', 'campfire', 'hiking'],
  site: {
    reservationBooked: true,
    canParkAtSite: true,
    drinkingWater: true,
    flushToilets: true,
    picnicTableAndFireRing: true,
    firewoodSoldOnSite: true,
    bearCountry: true,
    cellService: true,
  },
  vehicleIds: ['v-minivan'],
  rackIds: ['roof-rack'],
  shelters: [{ id: 'sh-1', name: 'Big tent', occupantIds: ['p-adult-1', 'p-adult-2', 'p-kid-1', 'p-kid-2'] }],
  mealPlan: FAMILY_MEAL_PLAN,
  packedBy: { 'kitchen-bin': 'p-adult-1', 'sleep-duffel': 'p-adult-2', 'cooler': 'p-adult-1' },
  leftBehind: [],
  coveredBy: {},
  households: [],
  jurisdiction: 'bc-parks',
  campRoles: [],
  plan: {
    routeNotes: 'Highway 99 north, site 42. Day hike to the lookout on day 2.',
    bailOutPoints: 'Britannia Beach (20 min south), Squamish General (35 min north).',
    nearestHospital: 'Squamish General Hospital, 38140 Behrner Dr',
    contactName: 'Sam',
    contactPhone: '555-0142',
    overdue: '8pm Monday 13 July',
  },
};

export const SOLO_BACKCOUNTRY_SHOULDER: Trip = {
  id: 'fixture-solo-backcountry',
  name: 'Solo backcountry, October',
  startDate: '2026-10-03',
  endDate: '2026-10-05',
  location: 'Garibaldi Provincial Park, BC',
  driveHours: 2,
  style: 'backcountry',
  weather: { precip: 'rain', overnightLow: 3, daytimeHigh: 9, windKph: 18 },
  attendeeIds: ['p-adult-1'],
  activityIds: ['hiking'],
  site: { bearCountry: true },
  vehicleIds: ['v-minivan'],
  rackIds: [],
  shelters: [{ id: 'sh-1', name: 'Solo tent', occupantIds: ['p-adult-1'] }],
  mealPlan: [
    { id: 'mp-1', dayIndex: 0, slot: 'dinner', mealId: 'meal-dehydrated' },
    { id: 'mp-2', dayIndex: 1, slot: 'breakfast', mealId: 'meal-oats' },
    { id: 'mp-3', dayIndex: 1, slot: 'dinner', mealId: 'meal-dehydrated' },
    { id: 'mp-4', dayIndex: 2, slot: 'breakfast', mealId: 'meal-oats' },
  ],
  packedBy: {},
  leftBehind: [],
  coveredBy: {},
  households: [],
  jurisdiction: 'unknown',
  campRoles: [],
  plan: BLANK_PLAN,
};

export const WINTER_HIKE_IN: Trip = {
  id: 'fixture-winter',
  name: 'Winter hut trip',
  startDate: '2027-01-16',
  endDate: '2027-01-18',
  location: 'Coast Mountains, BC',
  driveHours: 3,
  style: 'backcountry',
  weather: { precip: 'snow', overnightLow: -8, daytimeHigh: -1, windKph: 22 },
  attendeeIds: ['p-adult-1', 'p-adult-2'],
  activityIds: ['snowshoeing'],
  site: { bearCountry: false, cellService: false },
  vehicleIds: ['v-minivan'],
  rackIds: [],
  shelters: [{ id: 'sh-1', name: 'Winter tent', occupantIds: ['p-adult-1', 'p-adult-2'] }],
  mealPlan: [
    { id: 'mp-1', dayIndex: 0, slot: 'dinner', mealId: 'meal-dehydrated' },
    { id: 'mp-2', dayIndex: 1, slot: 'breakfast', mealId: 'meal-oats' },
  ],
  packedBy: {},
  leftBehind: [],
  coveredBy: {},
  households: [],
  jurisdiction: 'unknown',
  campRoles: [],
  plan: BLANK_PLAN,
};

export const KAYAK_TRIP: Trip = {
  id: 'fixture-kayak',
  name: 'Kayak, Desolation Sound',
  startDate: '2026-08-14',
  endDate: '2026-08-18',
  location: 'Desolation Sound, BC',
  driveHours: 4,
  style: 'paddle',
  weather: { precip: 'possible', overnightLow: 14, daytimeHigh: 23, windKph: 15 },
  attendeeIds: ['p-adult-1', 'p-adult-2'],
  activityIds: ['paddling', 'swimming', 'fishing'],
  site: { bearCountry: true, ferryCrossing: true },
  vehicleIds: ['v-minivan'],
  rackIds: ['kayak-rack', 'roof-rack'],
  shelters: [{ id: 'sh-1', name: 'Tent', occupantIds: ['p-adult-1', 'p-adult-2'] }],
  mealPlan: [
    { id: 'mp-1', dayIndex: 0, slot: 'dinner', mealId: 'meal-dehydrated' },
    { id: 'mp-2', dayIndex: 1, slot: 'breakfast', mealId: 'meal-oats' },
    { id: 'mp-3', dayIndex: 1, slot: 'dinner', mealId: 'meal-pasta' },
  ],
  packedBy: {},
  leftBehind: [],
  coveredBy: {},
  households: [],
  jurisdiction: 'unknown',
  campRoles: [],
  plan: BLANK_PLAN,
};

/** Degenerate: nobody selected. */
export const NOBODY: Trip = {
  ...FAMILY_CAR_SUMMER,
  id: 'fixture-nobody',
  name: 'Nobody going',
  attendeeIds: [],
  shelters: [],
  mealPlan: [],
  packedBy: {},
  leftBehind: [],
  coveredBy: {},
  households: [],
  jurisdiction: 'unknown',
  campRoles: [],
  plan: BLANK_PLAN,
};

/** Degenerate: zero nights. */
export const ZERO_NIGHTS: Trip = {
  ...FAMILY_CAR_SUMMER,
  id: 'fixture-zero-nights',
  name: 'Day trip',
  startDate: '2026-07-10',
  endDate: '2026-07-10',
};

export const ALL_FIXTURES = [
  FAMILY_CAR_SUMMER,
  SOLO_BACKCOUNTRY_SHOULDER,
  WINTER_HIKE_IN,
  KAYAK_TRIP,
  NOBODY,
  ZERO_NIGHTS,
];
