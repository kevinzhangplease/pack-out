/**
 * The domain model.
 *
 * Two things in here are load-bearing and should not be "simplified" later:
 *
 * 1. `Rule.conds` is a NON-EMPTY tuple. An empty condition list is not
 *    representable, so it can never be silently read as "always true".
 *    An item that always packs must say so with `{ kind: 'always' }`.
 *    See ADR-001 in docs/decisions.md.
 *
 * 2. Conditions are a discriminated union on `kind`, not on field name, so an
 *    operator can never be paired with a field it does not apply to.
 */

export type Id = string;

// ---------------------------------------------------------------------------
// Trip vocabulary
// ---------------------------------------------------------------------------

/** Winter is deliberately absent: it is a *condition* (temperature), not a style. */
export const TRIP_STYLES = [
  'car-camping',
  'van-camping',
  'crown-land',
  'backcountry',
  'paddle',
  'hut',
] as const;
export type TripStyle = (typeof TRIP_STYLES)[number];

/** Derived from style. Determines whether weight or volume is the constraint. */
export const TRANSPORTS = ['vehicle', 'carried', 'boat'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const STYLE_TRANSPORT: Record<TripStyle, Transport> = {
  'car-camping': 'vehicle',
  'van-camping': 'vehicle',
  'crown-land': 'vehicle',
  backcountry: 'carried',
  paddle: 'boat',
  hut: 'carried',
};

export const PRECIPS = ['none', 'possible', 'rain', 'heavy', 'snow', 'changeable'] as const;
export type Precip = (typeof PRECIPS)[number];

export const ROLES = ['adult', 'kid', 'toddler'] as const;
export type Role = (typeof ROLES)[number];

/** Food scales by appetite, not headcount. Overridable per person. */
export const EATER_UNITS: Record<Role, number> = { adult: 1, kid: 0.7, toddler: 0.5 };

/**
 * The site questionnaire. Standardised yes/no so that *both* answers are
 * usable by rules — "the site has no flush toilets" has to be expressible.
 * Unknown defaults to false, which is the safe direction to be wrong in.
 */
export const SITE_QUESTIONS = [
  'reservationBooked',
  'canParkAtSite',
  'drinkingWater',
  'electricalHookup',
  'flushToilets',
  'showers',
  'picnicTableAndFireRing',
  'firewoodSoldOnSite',
  'bearCountry',
  'cellService',
  'ferryCrossing',
] as const;
export type SiteQuestion = (typeof SITE_QUESTIONS)[number];

export const SITE_QUESTION_LABELS: Record<SiteQuestion, string> = {
  reservationBooked: 'reservation is booked',
  canParkAtSite: 'you can park at the site',
  drinkingWater: 'there is drinking water',
  electricalHookup: 'there is an electrical hookup',
  flushToilets: 'there are flush toilets',
  showers: 'there are showers',
  picnicTableAndFireRing: 'there is a picnic table and fire ring',
  firewoodSoldOnSite: 'firewood is sold on site',
  bearCountry: 'it is bear country',
  cellService: 'there is cell service',
  ferryCrossing: 'there is a ferry crossing en route',
};

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const NUMERIC_FIELDS = [
  'nights',
  'days',
  'people',
  'driveHours',
  'overnightLow',
  'daytimeHigh',
  'windKph',
] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

export const NUMERIC_OPS = ['atLeast', 'atMost', 'exactly'] as const;
export type NumericOp = (typeof NUMERIC_OPS)[number];

export const SET_FIELDS = [
  'style',
  'transport',
  'activity',
  'person',
  'role',
  'precip',
  'vehicle',
  'rack',
] as const;
export type SetField = (typeof SET_FIELDS)[number];

export interface NumericCond {
  kind: 'numeric';
  field: NumericField;
  op: NumericOp;
  value: number;
}

/** `not: true` renders as "is none of" — the negative form is essential. */
export interface SetCond {
  kind: 'set';
  field: SetField;
  values: string[];
  not?: boolean;
}

export interface SiteCond {
  kind: 'site';
  question: SiteQuestion;
  value: boolean;
}

/** The only way to say "this always packs". Deliberately explicit. */
export interface AlwaysCond {
  kind: 'always';
}

export type LeafCond = NumericCond | SetCond | SiteCond | AlwaysCond;

/**
 * Exactly one level of grouping — enough for "hiking AND (rain OR snow)",
 * shallow enough to stay readable in English and editable on a phone.
 */
export interface GroupCond {
  kind: 'group';
  mode: 'all' | 'any';
  conds: LeafCond[];
}

export type Cond = LeafCond | GroupCond;

/** Non-empty by construction. This is the type that prevents bug #1. */
export type NonEmpty<T> = [T, ...T[]];

export interface Rule {
  mode: 'all' | 'any';
  conds: NonEmpty<Cond>;
}

// ---------------------------------------------------------------------------
// Quantity
// ---------------------------------------------------------------------------

export const QTY_UNITS = [
  'flat',
  'perNight',
  'perDay',
  'perPerson',
  'perAdult',
  'perKid',
  'perPersonDay',
  /** Sleeping arrangement drives counts: one 6-person tent vs two tents. */
  'perShelter',
] as const;
export type QtyUnit = (typeof QTY_UNITS)[number];

export interface Qty {
  /** value = base + rate x unitCount, rounded up, then capped. */
  base: number;
  rate: number;
  unit: QtyUnit;
  /**
   * Issue one line per attending person rather than one pooled line.
   * Distinct from `unit: 'perPerson'`, which is a multiplier on a single line.
   */
  perPerson?: boolean;
  cap?: number;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  'shelter',
  'sleep',
  'kitchen',
  'food',
  'water',
  'clothing',
  'safety',
  'navigation',
  'light',
  'hygiene',
  'kids',
  'tools',
  'boat',
  'winter',
  'documents',
  'camp',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PHASES = [
  'weeks-out',
  't-3-days',
  'night-before',
  'morning-of',
  'en-route',
  'last-out-door',
  'at-camp',
  'pack-down',
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  'weeks-out': 'Weeks out',
  't-3-days': 'T-3 days',
  'night-before': 'Night before',
  'morning-of': 'Morning of',
  'en-route': 'En route',
  'last-out-door': 'Last thing out the door',
  'at-camp': 'At camp',
  'pack-down': 'Pack-down',
};

/**
 * durable         — lives packed; verify it, do not "check" it
 * consumable      — gets used up; needs restocking
 * vehicle-resident— never leaves the vehicle; collapsed by default
 */
export const KINDS = ['durable', 'consumable', 'vehicle-resident'] as const;
export type ItemKind = (typeof KINDS)[number];

export type ItemType = 'gear' | 'action';

export type Ownership = 'personal' | 'group' | 'shared-with-another-household';

export const GEAR_CONDITIONS = ['ok', 'needs-repair', 'retired', 'unknown'] as const;
export type GearCondition = (typeof GEAR_CONDITIONS)[number];

/**
 * Gear state annotates and feeds the shopping list. It must NEVER suppress an
 * item from the packing list — absence always traces to a rule, never to a
 * stale belief about what is in the bin. See ADR-003.
 */
export interface GearState {
  condition?: GearCondition;
  /** 0..1 for fuel/battery. Undefined means not tracked. */
  level?: number;
  lastUsedISO?: string;
  stock?: number;
  borrowedFrom?: string;
  loanedTo?: string;
  note?: string;
}

export interface Item {
  id: Id;
  name: string;
  category: Category;
  container: Id;
  note?: string;
  rule: Rule;
  qty: Qty;
  weight_g: number;
  phase: Phase;
  kind: ItemKind;
  type: ItemType;
  /** Goes in bear storage even though it is not food. */
  scented?: boolean;
  ownership: Ownership;
  /** Set when the last trigger this item depended on was deleted. */
  orphaned?: boolean;
  gear?: GearState;
  /**
   * Override the pack zone this item's category would otherwise imply.
   * Only meaningful when the transport is carried.
   */
  packZone?: PackZone;
}

export interface Container {
  id: Id;
  name: string;
  /** Where it rides, per transport. The load plan reads this. */
  zones?: Partial<Record<Transport, LoadZone>>;
  note?: string;
}

export interface Activity {
  id: Id;
  name: string;
  minRole?: Role;
  rainyAlternate?: string;
}

export interface Person {
  id: Id;
  name: string;
  role: Role;
  /** Needed for the shakedown pass. Nothing else reads it. */
  bodyWeight_kg?: number;
  /** Multiplier on their eater-unit. 1 means "as expected for the role". */
  appetite?: number;
  dietary?: string[];
  allergies?: string[];
  medications?: string[];
}

export interface Vehicle {
  id: Id;
  name: string;
  racks: string[];
}

// ---------------------------------------------------------------------------
// Library / Trip / Session — three lifetimes, three storage scopes
// ---------------------------------------------------------------------------

export interface Library {
  schemaVersion: number;
  items: Item[];
  containers: Container[];
  activities: Activity[];
  people: Person[];
  vehicles: Vehicle[];
  meals: Meal[];
  /**
   * Pantry staples: name -> is it in stock. Track stock, not presence, so salt
   * and oil stop appearing on the shopping list every single trip.
   */
  pantry: Record<string, boolean>;
}

export interface Weather {
  precip: Precip;
  overnightLow: number;
  daytimeHigh: number;
  windKph: number;
}

export interface Trip {
  id: Id;
  name: string;
  /** Nights are DERIVED from these. Never store a nights count. */
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  location: string;
  driveHours: number;
  style: TripStyle;
  weather: Weather;
  attendeeIds: Id[];
  activityIds: Id[];
  site: Partial<Record<SiteQuestion, boolean>>;
  vehicleIds: Id[];
  rackIds: string[];
  shelters: Shelter[];
  mealPlan: MealPlanEntry[];
  /**
   * Who is responsible for PACKING a thing, which is not the same as whose it
   * is. Keyed by container id, with item ids as overrides. With two adults and
   * two kids, division of labour is the actual constraint.
   */
  packedBy: Record<string, Id>;
  /**
   * Items another household is bringing, keyed by item id. Trip-scoped, not
   * library-scoped: who brings the stove is a fact about one weekend, not a
   * durable property of the stove.
   */
  coveredBy: Record<string, Id>;
  households: Household[];
  jurisdiction: Jurisdiction;
  campRoles: CampRole[];
  plan: TripPlan;
  /**
   * Deliberately left behind on this trip after a shakedown. These are shown
   * struck through rather than removed, because a decision is not the same as
   * an absence and you should be able to see what you chose to drop.
   */
  leftBehind: Id[];
}

export interface Shelter {
  id: Id;
  name: string;
  occupantIds: Id[];
}

/** Per-trip, resettable. Never bleeds between trips. */
export interface Session {
  tripId: Id;
  checked: Record<string, boolean>;
  collapsed: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Food
//
// Meals are planned per meal, per day, against the real dates — "Day 2
// breakfast", never "two breakfasts". Each meal contributes three distinct
// things to the list: cooking instruments, ingredients, eating instruments.
// ---------------------------------------------------------------------------

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** The shopping list is grouped by these. It is a different document from the
 *  packing list, used at a different time, in a different building. */
export const STORE_SECTIONS = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'dry-goods',
  'canned',
  'frozen',
  'drinks',
  'household',
] as const;
export type StoreSection = (typeof STORE_SECTIONS)[number];

/** Coolers lose the fight around day three. This is what makes that checkable. */
export const COLD_CHAINS = ['ambient', 'refrigerated', 'frozen'] as const;
export type ColdChain = (typeof COLD_CHAINS)[number];

export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'ea', 'tbsp', 'tsp', 'cup', 'pack'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export interface Ingredient {
  id: Id;
  name: string;
  /** Per eater-unit when scaling is 'per-eater', otherwise the whole amount. */
  amount: number;
  unit: IngredientUnit;
  scaling: 'per-eater' | 'flat';
  section: StoreSection;
  cold: ColdChain;
  /** Lives in the pantry box. Tracked by stock, not bought every trip. */
  pantryStaple?: boolean;
  allergens?: string[];
}

export interface PrepTask {
  id: Id;
  name: string;
  phase: Phase;
  note?: string;
}

export interface Meal {
  id: Id;
  name: string;
  slots: MealSlot[];
  ingredients: Ingredient[];
  /** Library item ids: the cooking instruments this meal needs. */
  cookware: Id[];
  /** Library item ids: the eating instruments. */
  serveware: Id[];
  /** Complexity budget. Arrival night must be trivial. */
  pots: number;
  needsFire: boolean;
  noCook: boolean;
  /** A meal worth doing once a trip and never twice. */
  project: boolean;
  prep: PrepTask[];
  producesLeftovers?: boolean;
  /** Litres per eater-unit for cooking AND cleanup, not just drinking. */
  waterL: number;
  note?: string;
}

export interface MealPlanEntry {
  id: Id;
  /** 0 is the arrival day. Resolved against the real dates. */
  dayIndex: number;
  slot: MealSlot;
  mealId: Id;
  /** A leftovers lunch that is not tied to the dinner that produced it is a guess. */
  leftoversFrom?: Id;
}

// ---------------------------------------------------------------------------
// Load order
//
// Where a thing physically goes. Three vocabularies, because the constraint is
// different in each: a vehicle is volume and access order, a pack is weight
// against your back, a kayak is trim and reach.
// ---------------------------------------------------------------------------

/** Nose at the top. These are footprint zones, so they can be drawn top-down. */
export const VEHICLE_ZONES = [
  'roof',
  'cabin-front',
  'cabin-rear',
  'boot-front',
  'boot-rear',
  'under-floor',
  'hitch',
] as const;
export type VehicleZone = (typeof VEHICLE_ZONES)[number];

export const VEHICLE_ZONE_LABELS: Record<VehicleZone, string> = {
  roof: 'Roof',
  'cabin-front': 'Cabin, front',
  'cabin-rear': 'Cabin, second row',
  'boot-front': 'Boot, forward',
  'boot-rear': 'Boot, at the tailgate',
  'under-floor': 'Under the floor',
  hitch: 'Hitch rack',
};

export const VEHICLE_ZONE_NOTES: Record<VehicleZone, string> = {
  roof: 'Light and bulky only. Everything up here is windage and centre of gravity.',
  'cabin-front': 'Reachable while driving. Nothing loose that could become a projectile.',
  'cabin-rear': 'Kids can reach this. Put the things they will ask for here.',
  'boot-front': 'Heavy, low and forward. This is where the weight belongs.',
  'boot-rear': 'Last in, first out. Whatever you need before the tailgate is fully unpacked.',
  'under-floor': 'Lives here between trips. Verify, do not repack.',
  hitch: 'Check the strap at every stop.',
};

export const PACK_ZONES = ['bottom', 'core', 'lid', 'hipbelt', 'outside'] as const;
export type PackZone = (typeof PACK_ZONES)[number];

export const PACK_ZONE_LABELS: Record<PackZone, string> = {
  bottom: 'Bottom',
  core: 'Core, against your back',
  lid: 'Lid',
  hipbelt: 'Hipbelt pockets',
  outside: 'Strapped outside',
};

export const PACK_ZONE_NOTES: Record<PackZone, string> = {
  bottom: 'Soft and not needed until camp.',
  core: 'The heavy things, high and against your spine. This is what makes a pack carry.',
  lid: 'Wanted during the day without taking the pack off your back... almost.',
  hipbelt: 'Reachable while walking.',
  outside: 'Wet, sharp, or wanted instantly. Everything here can snag.',
};

export const BOAT_ZONES = ['bow', 'cockpit', 'day-hatch', 'stern', 'deck'] as const;
export type BoatZone = (typeof BOAT_ZONES)[number];

export const BOAT_ZONE_LABELS: Record<BoatZone, string> = {
  bow: 'Bow',
  cockpit: 'Cockpit',
  'day-hatch': 'Day hatch',
  stern: 'Stern',
  deck: 'On deck',
};

export const BOAT_ZONE_NOTES: Record<BoatZone, string> = {
  bow: 'Light and bulky. Too much weight here and she will not turn.',
  cockpit: 'Between your legs and behind the seat. Nothing that can trap you.',
  'day-hatch': 'The only thing you can reach on the water.',
  stern: 'Heavy. Trim the boat slightly stern-down.',
  deck: 'Only what must be instant. Everything on deck is windage and something to catch a wave.',
};

export type LoadZone = VehicleZone | PackZone | BoatZone;

// ---------------------------------------------------------------------------
// Judgement
// ---------------------------------------------------------------------------

/**
 * Jurisdiction matters: BC Parks, rec sites, Crown land and First Nations
 * territory have different rules on fires, dogs and stay limits, and the app
 * cannot know which one you are on. It prompts.
 */
export const JURISDICTIONS = [
  'unknown',
  'bc-parks',
  'rec-site',
  'crown-land',
  'first-nations',
  'regional-park',
  'private',
] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  unknown: 'Not sure yet',
  'bc-parks': 'BC Parks',
  'rec-site': 'Rec site (Sites and Trails BC)',
  'crown-land': 'Crown land',
  'first-nations': 'First Nations territory',
  'regional-park': 'Regional or municipal park',
  private: 'Private campground',
};

/**
 * A trip plan is a first-class object, not a checkbox. Most of it is generated;
 * these are the fields only a person can supply.
 */
export interface TripPlan {
  routeNotes: string;
  bailOutPoints: string;
  nearestHospital: string;
  contactName: string;
  contactPhone: string;
  /** "If you have not heard from us by this time, act." */
  overdue: string;
  sharedAtISO?: string;
}

export const CAMP_JOBS = [
  'pitch-camp',
  'cook',
  'dishes',
  'fire',
  'water',
  'bear-hang',
  'strike-camp',
] as const;
export type CampJob = (typeof CAMP_JOBS)[number];

export const CAMP_JOB_LABELS: Record<CampJob, string> = {
  'pitch-camp': 'Pitch camp',
  cook: 'Cook',
  dishes: 'Dishes',
  fire: 'Fire',
  water: 'Water',
  'bear-hang': 'Bear hang',
  'strike-camp': 'Strike camp',
};

export interface CampRole {
  id: Id;
  job: CampJob;
  /** Undefined means "the whole trip" rather than a particular day. */
  dayIndex?: number;
  personId?: Id;
}

/** Camping with another family. Splitting group gear is the whole point. */
export interface Household {
  id: Id;
  name: string;
}
