import {
  EATER_UNITS,
  STYLE_TRANSPORT,
  SITE_QUESTIONS,
  type Library,
  type Person,
  type SiteQuestion,
  type Transport,
  type Trip,
  type TripStyle,
  type Precip,
  type Id,
} from '../data/types';

/**
 * The flattened fact bag the engine reads. Nothing downstream of here ever
 * touches a raw Trip, so every derivation (nights, transport, eater-units) is
 * defined exactly once and tested exactly once.
 */
export interface TripFacts {
  nights: number;
  days: number;
  people: number;
  driveHours: number;
  overnightLow: number;
  daytimeHigh: number;
  windKph: number;

  style: TripStyle;
  transport: Transport;
  precip: Precip;

  activityIds: Set<Id>;
  personIds: Set<Id>;
  roles: Set<string>;
  vehicleIds: Set<Id>;
  rackIds: Set<string>;

  site: Record<SiteQuestion, boolean>;

  attendees: Person[];
  adults: number;
  kids: number;
  toddlers: number;
  eaterUnits: number;
  shelterCount: number;
}

/** Whole nights between two YYYY-MM-DD dates. Never negative. */
export function nightsBetween(startISO: string, endISO: string): number {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const nights = Math.round((end - start) / 86_400_000);
  return nights > 0 ? nights : 0;
}

export function eaterUnitsFor(person: Person): number {
  return EATER_UNITS[person.role] * (person.appetite ?? 1);
}

export function deriveFacts(trip: Trip, library: Library): TripFacts {
  const attendees = trip.attendeeIds
    .map((id) => library.people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p));

  const nights = nightsBetween(trip.startDate, trip.endDate);

  // Days = nights + 1, but a trip with no nights is not a -0-day trip.
  const days = nights > 0 ? nights + 1 : 0;

  const site = Object.fromEntries(
    SITE_QUESTIONS.map((q) => [q, trip.site[q] ?? false]),
  ) as Record<SiteQuestion, boolean>;

  const byRole = (role: string) => attendees.filter((p) => p.role === role).length;

  return {
    nights,
    days,
    people: attendees.length,
    driveHours: trip.driveHours,
    overnightLow: trip.weather.overnightLow,
    daytimeHigh: trip.weather.daytimeHigh,
    windKph: trip.weather.windKph,

    style: trip.style,
    transport: STYLE_TRANSPORT[trip.style],
    precip: trip.weather.precip,

    activityIds: new Set(trip.activityIds),
    personIds: new Set(attendees.map((p) => p.id)),
    roles: new Set(attendees.map((p) => p.role)),
    vehicleIds: new Set(trip.vehicleIds),
    rackIds: new Set(trip.rackIds),

    site,

    attendees,
    adults: byRole('adult'),
    kids: byRole('kid'),
    toddlers: byRole('toddler'),
    eaterUnits: attendees.reduce((sum, p) => sum + eaterUnitsFor(p), 0),
    shelterCount: trip.shelters.length,
  };
}
