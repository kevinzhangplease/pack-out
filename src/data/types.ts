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
  /** Another household is bringing this one. */
  coveredBy?: string;
  gear?: GearState;
}

export interface Container {
  id: Id;
  name: string;
  /** Where it rides. Drives the load-order view in phase 4. */
  loadZone?: string;
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
