import type { Jurisdiction, Library, Trip } from '../data/types';
import { JURISDICTION_LABELS } from '../data/types';
import type { TripFacts } from './facts';
import type { BuildResult, ListLine } from './build';
import type { Gate } from './gates';
import { daylightFor, formatClock } from './daylight';

/**
 * The things a guide, a camp leader and a parent would insist on, expressed as
 * prompts rather than assertions. The app does not know which side of a
 * boundary you are on or what the bears are doing this week — so it says what
 * it cannot know and points at who does.
 */

// ---------------------------------------------------------------------------
// Jurisdiction
// ---------------------------------------------------------------------------

export interface JurisdictionNote {
  topic: 'fires' | 'dogs' | 'stay-limit' | 'permits' | 'protocol';
  text: string;
}

const NOTES: Record<Jurisdiction, JurisdictionNote[]> = {
  unknown: [
    {
      topic: 'permits',
      text: 'Pack Out does not know whose land this is, and the rules on fires, dogs and stay limits differ on all of them. Find out before you go.',
    },
  ],
  'bc-parks': [
    { topic: 'fires', text: 'Fires only in the provided ring, and only when there is no ban. Check the park page the morning you leave.' },
    { topic: 'dogs', text: 'Dogs on leash, and banned outright from many beaches and backcountry areas.' },
    { topic: 'stay-limit', text: 'Typically 14 days in a 30-day period.' },
    { topic: 'permits', text: 'Backcountry permits and reservations are separate from the frontcountry booking.' },
  ],
  'rec-site': [
    { topic: 'fires', text: 'Usually permitted in existing rings outside a ban. Nobody is maintaining them, so check the ring yourself.' },
    { topic: 'dogs', text: 'Generally allowed under control. You are sharing the road with logging traffic.' },
    { topic: 'stay-limit', text: 'Typically 14 days. Sites are first come, first served — have a second option.' },
    { topic: 'permits', text: 'Free, unmaintained, no water. Pack out everything, including what the last group left.' },
  ],
  'crown-land': [
    { topic: 'fires', text: 'Campfire bans apply here too, and enforcement is thin — which makes it your judgement, not somebody else s.' },
    { topic: 'stay-limit', text: 'Generally 14 days in one spot for BC residents.' },
    { topic: 'permits', text: 'Check the forest service road status and whether there is active hauling. Nobody is coming to get you off one quickly.' },
    { topic: 'protocol', text: 'Crown land is unceded territory. Find out whose, and check whether there are closures or protocols in place.' },
  ],
  'first-nations': [
    { topic: 'protocol', text: 'Contact the Nation before you go. Access, camping and harvesting are theirs to decide, and a permit may be required.' },
    { topic: 'fires', text: 'Ask. Do not assume a ring means permission.' },
  ],
  'regional-park': [
    { topic: 'fires', text: 'Often no fires at all, regardless of provincial bans.' },
    { topic: 'dogs', text: 'On leash, with seasonal beach restrictions.' },
    { topic: 'stay-limit', text: 'Check — many do not allow overnight camping.' },
  ],
  private: [
    { topic: 'fires', text: 'Their rules, and they may sell you the wood.' },
    { topic: 'dogs', text: 'Ask when booking.' },
  ],
};

export function jurisdictionNotes(jurisdiction: Jurisdiction): JurisdictionNote[] {
  return NOTES[jurisdiction];
}

export function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  return JURISDICTION_LABELS[jurisdiction];
}

// ---------------------------------------------------------------------------
// Seasonal hazards, keyed to the dates
// ---------------------------------------------------------------------------

export interface SeasonalHazard {
  id: string;
  title: string;
  detail: string;
  /** What the app cannot check for you. */
  check?: string;
}

/** Months are 1-12 and ranges may wrap the year. */
function inMonths(month: number, from: number, to: number): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/**
 * BC-specific and deliberately so. A generic hazard list would be useless;
 * these are keyed to when things actually happen on this coast and interior.
 */
export function seasonalHazards(trip: Trip, facts: TripFacts): SeasonalHazard[] {
  const month = Number(trip.startDate.slice(5, 7));
  if (!month) return [];

  const hazards: SeasonalHazard[] = [];

  if (inMonths(month, 3, 6)) {
    hazards.push({
      id: 'ticks',
      title: 'Tick season',
      detail:
        'Peak March to June, worst in dry grass and brush in the interior. Check everyone at the end of each day, including hairlines.',
      check: 'A tick remover is on the list when hiking is planned.',
    });
  }

  if (inMonths(month, 5, 7)) {
    hazards.push({
      id: 'freshet',
      title: 'Freshet — high water',
      detail:
        'Snowmelt makes creeks and rivers fast, cold and higher than they look. Crossings that were ankle-deep in September are not, and the banks undercut.',
      check: 'Nothing in this app knows today s flow. Check the river forecast and keep the kids off the banks.',
    });
  }

  if (inMonths(month, 4, 6)) {
    hazards.push({
      id: 'bears-spring',
      title: 'Spring bears',
      detail:
        'Bears come down to green-up on valley bottoms and avalanche paths — exactly where the trails are. Sows with cubs are the ones to worry about.',
      check: 'Make noise on blind corners. Bear spray on the hipbelt, not in the pack.',
    });
  }

  if (inMonths(month, 8, 10)) {
    hazards.push({
      id: 'bears-fall',
      title: 'Fall bears — hyperphagia',
      detail:
        'Bears are feeding twenty hours a day before denning, and they are much less inclined to leave a food source. Berry patches and salmon streams are where they are.',
      check: 'Everything scented goes into storage, including the toothpaste and the garbage.',
    });
  }

  if (inMonths(month, 8, 9)) {
    hazards.push({
      id: 'wasps',
      title: 'Wasps',
      detail:
        'Ground nests peak in late summer, and they find the meat and the sweet drinks. A nest at a campsite ends the weekend.',
      check: 'If anyone carries an EpiPen, two of them, in separate packs.',
    });
  }

  if (inMonths(month, 7, 9)) {
    hazards.push({
      id: 'fire-season',
      title: 'Fire season',
      detail:
        'Category 1 bans arrive with little notice and evacuation alerts arrive with less. Smoke can make a valley unbreathable within a day.',
      check: 'Check the BC Wildfire map the morning you leave, and know your route out.',
    });
  }

  if (inMonths(month, 11, 3) || facts.overnightLow <= 0) {
    hazards.push({
      id: 'winter-conditions',
      title: 'Winter conditions',
      detail:
        'Short days, cold nights, and roads that close. Daylight is the resource you will run out of first.',
      check: 'Carry chains, tell somebody your route, and plan to be set up two hours before dark.',
    });
  }

  if (facts.site.ferryCrossing) {
    hazards.push({
      id: 'ferry',
      title: 'Ferry crossing',
      detail:
        'Sailings fill on long weekends and a missed one can cost you a day. Reservations and the actual sailing schedule are different things.',
    });
  }

  return hazards;
}

/** Will you be setting up in the dark? Uses the location's latitude if given. */
export function arrivalDaylight(
  trip: Trip,
  latitude: number | null,
  departureHour = 9,
): { sunset: string; setupInDark: boolean; minutesLeft: number } | null {
  if (latitude === null) return null;
  const light = daylightFor(latitude, trip.startDate);
  if (!light) return null;
  const arrivesAt = (departureHour + trip.driveHours) * 60;
  const minutesLeft = Math.round(light.sunsetMinutes - arrivesAt);
  return {
    sunset: formatClock(light.sunsetMinutes),
    minutesLeft,
    setupInDark: minutesLeft < 90,
  };
}

// ---------------------------------------------------------------------------
// The trip plan document
// ---------------------------------------------------------------------------

export interface TripPlanDocument {
  complete: boolean;
  missing: string[];
  text: string;
}

/**
 * Generated and shareable. The person who receives this needs to be able to act
 * on it without knowing anything about camping — so it says who, where, when
 * back, and what to do when that time passes.
 */
export function tripPlanDocument(
  trip: Trip,
  library: Library,
  facts: TripFacts,
  result: BuildResult,
  gates: Gate[] = [],
): TripPlanDocument {
  const missing: string[] = [];
  if (!trip.location.trim()) missing.push('where you are going');
  if (!trip.plan.routeNotes.trim()) missing.push('the route');
  if (!trip.plan.bailOutPoints.trim()) missing.push('bail-out points');
  if (!trip.plan.nearestHospital.trim()) missing.push('the nearest hospital');
  if (!trip.plan.contactName.trim()) missing.push('who to call');
  if (!trip.plan.overdue.trim()) missing.push('when to worry');
  if (facts.people === 0) missing.push('who is going');

  const vehicles = library.vehicles
    .filter((v) => trip.vehicleIds.includes(v.id))
    .map((v) => v.name);

  const medical = facts.attendees
    .filter((p) => (p.allergies?.length ?? 0) > 0 || (p.medications?.length ?? 0) > 0)
    .map((p) => {
      const bits = [
        p.allergies?.length ? `allergic to ${p.allergies.join(', ')}` : '',
        p.medications?.length ? `takes ${p.medications.join(', ')}` : '',
      ].filter(Boolean);
      return `  ${p.name}: ${bits.join('; ')}`;
    });

  const comms = result.lines.some((l) => l.item.id === 'satellite-messenger')
    ? 'Satellite messenger carried.'
    : facts.site.cellService
      ? 'Cell service expected at the site.'
      : 'NO cell service and no satellite messenger. We cannot call out.';

  const rule = '='.repeat(56);
  const lines: string[] = [
    'TRIP PLAN',
    rule,
    `Trip:      ${trip.name}`,
    `Where:     ${trip.location || '— not filled in —'}`,
    `Style:     ${trip.style} (${facts.transport})`,
    `Out:       ${trip.startDate}`,
    `Back:      ${trip.endDate}  (${facts.nights} nights)`,
    `Vehicle:   ${vehicles.join(', ') || '— none recorded —'}`,
    `Party:     ${facts.attendees.map((p) => `${p.name} (${p.role})`).join(', ') || '— nobody —'}`,
    `Land:      ${jurisdictionLabel(trip.jurisdiction)}`,
    '',
    'ROUTE',
    trip.plan.routeNotes || '— not filled in —',
    '',
    'BAIL-OUT POINTS',
    trip.plan.bailOutPoints || '— not filled in —',
    '',
    'IF SOMETHING GOES WRONG',
    `Nearest hospital:  ${trip.plan.nearestHospital || '— not filled in —'}`,
    `Communications:    ${comms}`,
    '',
    'IF YOU HAVE NOT HEARD FROM US',
    `By:        ${trip.plan.overdue || '— not filled in —'}`,
    `Call:      ${trip.plan.contactName || '— not filled in —'} ${trip.plan.contactPhone}`,
    'Then:      call the local RCMP detachment and give them this document.',
  ];

  if (medical.length) {
    lines.push('', 'MEDICAL', ...medical);
  }

  if (gates.length) {
    lines.push('', 'THE APP FLAGGED');
    for (const gate of gates) {
      lines.push(`  ${gate.title}`);
      if (gate.disclaimer) lines.push(`    ${gate.disclaimer}`);
    }
  }

  lines.push('', rule, 'Generated by Pack Out. The route and the judgement are the party s own.');

  return { complete: missing.length === 0, missing, text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Multi-household
// ---------------------------------------------------------------------------

export interface CoverageResult {
  ours: ListLine[];
  theirs: { line: ListLine; householdName: string }[];
  savedWeight_g: number;
}

/**
 * Camping with another family means splitting the group gear so four camp
 * stoves do not show up. Covered items are shown as covered rather than
 * deleted — you need to be able to see what you are relying on somebody else
 * for, because that is exactly what gets forgotten.
 */
export function applyCoverage(lines: ListLine[], trip: Trip): CoverageResult {
  const theirs: CoverageResult['theirs'] = [];
  const ours: ListLine[] = [];

  for (const line of lines) {
    const householdId = trip.coveredBy[line.item.id];
    const household = householdId
      ? trip.households.find((h) => h.id === householdId)
      : undefined;
    if (household) theirs.push({ line, householdName: household.name });
    else ours.push(line);
  }

  return {
    ours,
    theirs,
    savedWeight_g: theirs.reduce((sum, t) => sum + t.line.weight_g, 0),
  };
}

/** Only group gear is worth splitting; personal gear is nobody else's job. */
export function splittableItems(lines: ListLine[]): ListLine[] {
  return lines.filter(
    (line) => line.item.ownership === 'group' && line.item.type === 'gear' && !line.person,
  );
}

// ---------------------------------------------------------------------------
// Camp roles
// ---------------------------------------------------------------------------

export interface CampRoleSuggestion {
  job: 'cook' | 'dishes';
  dayIndex: number;
  label: string;
}

/**
 * Suggested camp jobs, derived from the meal plan: every dinner needs somebody
 * cooking it and somebody else doing the dishes.
 */
export function suggestedCampRoles(
  dinners: { dayIndex: number; label: string; mealName: string }[],
): CampRoleSuggestion[] {
  return dinners.flatMap((dinner) => [
    { job: 'cook' as const, dayIndex: dinner.dayIndex, label: `${dinner.label}: ${dinner.mealName}` },
    { job: 'dishes' as const, dayIndex: dinner.dayIndex, label: `${dinner.label}: after ${dinner.mealName}` },
  ]);
}

/** Nobody should do dishes after cooking the same meal. */
export function roleClashes(
  roles: { job: string; dayIndex?: number; personId?: string }[],
  library: Library,
): string[] {
  const clashes: string[] = [];
  const byDay = new Map<string, typeof roles>();
  for (const role of roles) {
    if (!role.personId) continue;
    const key = String(role.dayIndex ?? 'all');
    byDay.set(key, [...(byDay.get(key) ?? []), role]);
  }
  for (const [day, dayRoles] of byDay) {
    const cook = dayRoles.find((r) => r.job === 'cook');
    const dishes = dayRoles.find((r) => r.job === 'dishes');
    if (cook && dishes && cook.personId === dishes.personId) {
      const name = library.people.find((p) => p.id === cook.personId)?.name ?? 'Somebody';
      clashes.push(
        `${name} is cooking and doing the dishes on day ${Number(day) + 1}. That is the fastest way to a bad evening.`,
      );
    }
  }
  return clashes;
}
