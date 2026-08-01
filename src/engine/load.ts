import type {
  BoatZone,
  Category,
  Id,
  Library,
  LoadZone,
  PackZone,
  Person,
  Transport,
  Trip,
} from '../data/types';
import {
  BOAT_ZONES,
  BOAT_ZONE_LABELS,
  BOAT_ZONE_NOTES,
  PACK_ZONES,
  PACK_ZONE_LABELS,
  PACK_ZONE_NOTES,
  VEHICLE_ZONES,
  VEHICLE_ZONE_LABELS,
  VEHICLE_ZONE_NOTES,
} from '../data/types';
import type { BuildResult, ListLine } from './build';
import type { TripFacts } from './facts';

/**
 * Where everything physically goes, and whether it will fit on your back.
 *
 * The load plan is switchable by transport rather than fixed by trip style,
 * because you frequently drive to a trailhead: the same list gets loaded into a
 * van in the morning and into a pack at lunchtime.
 */

/**
 * Pack zones fall out of what a thing IS, not which bin it lives in — bins are
 * a car-camping idea. A container's zone wins when it has one, and an explicit
 * `packZone` on the item wins over both.
 */
const CATEGORY_PACK_ZONE: Record<Category, PackZone> = {
  sleep: 'bottom',
  clothing: 'bottom',
  kitchen: 'core',
  food: 'core',
  winter: 'core',
  kids: 'core',
  tools: 'core',
  water: 'outside',
  shelter: 'outside',
  boat: 'outside',
  camp: 'outside',
  safety: 'lid',
  navigation: 'lid',
  light: 'lid',
  hygiene: 'lid',
  documents: 'lid',
};

export function zoneFor(line: ListLine, transport: Transport, library: Library): LoadZone | null {
  if (line.item.type === 'action') return null;

  if (transport === 'carried') {
    if (line.item.packZone) return line.item.packZone;
    const container = library.containers.find((c) => c.id === line.item.container);
    const fromContainer = container?.zones?.carried;
    if (fromContainer) return fromContainer;
    return CATEGORY_PACK_ZONE[line.item.category];
  }

  const container = library.containers.find((c) => c.id === line.item.container);
  const zone = container?.zones?.[transport];
  if (zone) return zone;

  // No mapping is a real answer, not a crash: the plan shows an "unassigned"
  // zone so a container missing its placement is visible rather than silent.
  return null;
}

export interface LoadZoneGroup {
  zone: LoadZone | 'unassigned';
  label: string;
  note: string;
  lines: ListLine[];
  weight_g: number;
}

const ZONE_ORDER: Record<Transport, readonly LoadZone[]> = {
  vehicle: VEHICLE_ZONES,
  carried: PACK_ZONES,
  boat: BOAT_ZONES,
};

const ZONE_LABELS: Record<string, string> = {
  ...VEHICLE_ZONE_LABELS,
  ...PACK_ZONE_LABELS,
  ...BOAT_ZONE_LABELS,
};

const ZONE_NOTES: Record<string, string> = {
  ...VEHICLE_ZONE_NOTES,
  ...PACK_ZONE_NOTES,
  ...BOAT_ZONE_NOTES,
};

export function loadPlan(
  lines: ListLine[],
  transport: Transport,
  library: Library,
): LoadZoneGroup[] {
  const buckets = new Map<string, ListLine[]>();

  for (const line of lines) {
    const zone = zoneFor(line, transport, library);
    if (zone === null && line.item.type === 'action') continue;
    const key = zone ?? 'unassigned';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(line);
    else buckets.set(key, [line]);
  }

  const ordered: LoadZoneGroup[] = ZONE_ORDER[transport]
    .filter((zone) => buckets.has(zone))
    .map((zone) => ({
      zone,
      label: ZONE_LABELS[zone] ?? zone,
      note: ZONE_NOTES[zone] ?? '',
      lines: buckets.get(zone)!,
      weight_g: buckets.get(zone)!.reduce((sum, l) => sum + l.weight_g, 0),
    }));

  const unassigned = buckets.get('unassigned');
  if (unassigned) {
    ordered.push({
      zone: 'unassigned',
      label: 'No place assigned',
      note: 'These containers have no zone for this transport. Give them one, or they end up wherever there is a gap.',
      lines: unassigned,
      weight_g: unassigned.reduce((sum, l) => sum + l.weight_g, 0),
    });
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// Responsibility — who packs it, which is not the same as whose it is
// ---------------------------------------------------------------------------

/** Item-level assignment wins over the container it lives in. */
export function packerFor(line: ListLine, trip: Trip): Id | null {
  return trip.packedBy[line.item.id] ?? trip.packedBy[line.item.container] ?? null;
}

export interface ResponsibilityGroup {
  key: string;
  label: string;
  lines: ListLine[];
  weight_g: number;
}

export function byResponsibility(
  lines: ListLine[],
  trip: Trip,
  library: Library,
): ResponsibilityGroup[] {
  const buckets = new Map<string, ListLine[]>();
  for (const line of lines) {
    const key = packerFor(line, trip) ?? '__nobody';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(line);
    else buckets.set(key, [line]);
  }

  return [...buckets.entries()]
    .map(([key, group]) => ({
      key,
      label:
        key === '__nobody'
          ? 'Nobody has this yet'
          : (library.people.find((p) => p.id === key)?.name ?? key),
      lines: group,
      weight_g: group.reduce((sum, l) => sum + l.weight_g, 0),
    }))
    .sort((a, b) => (a.key === '__nobody' ? 1 : b.key === '__nobody' ? -1 : a.label.localeCompare(b.label)));
}

// ---------------------------------------------------------------------------
// Shakedown — what to leave behind
// ---------------------------------------------------------------------------

/** Roughly a fifth of body weight is where a pack stops being carryable. */
export const PACK_WEIGHT_LIMIT = 0.2;

/** Used when somebody has no body weight recorded, so the pass still runs. */
const ASSUMED_BODY_WEIGHT: Record<string, number> = { adult: 70, kid: 25, toddler: 14 };

export interface PersonLoad {
  person: Person;
  /** Their personal items plus their share of group gear. */
  weight_g: number;
  bodyWeight_kg: number;
  assumedBodyWeight: boolean;
  ratio: number;
  overLimit: boolean;
  /** Heaviest first: the candidates for leaving behind. */
  heaviest: ListLine[];
}

export interface Shakedown {
  applies: boolean;
  perPerson: PersonLoad[];
  totalWeight_g: number;
  leftBehind: ListLine[];
  leftBehindWeight_g: number;
}

/**
 * A shakedown only makes sense when somebody is carrying the load. On a vehicle
 * trip the answer is always "it fits", and pretending otherwise is noise.
 *
 * `transport` is the one being LOOKED AT, not the trip's own — the whole point
 * of a switchable load plan is that you drive to a trailhead, and the weight
 * question is the one you want answered while looking at the pack.
 *
 * Group gear is divided among the adults, because that is who carries it.
 */
export function shakedown(
  result: BuildResult,
  facts: TripFacts,
  leftBehindLines: ListLine[] = [],
  transport: Transport = facts.transport,
): Shakedown {
  const applies = transport === 'carried' || transport === 'boat';

  const carriers = facts.attendees.filter((p) => p.role === 'adult');
  const sharers = carriers.length > 0 ? carriers : facts.attendees;

  const groupWeight = result.lines
    .filter((l) => !l.person)
    .reduce((sum, l) => sum + l.weight_g, 0);
  const share = sharers.length > 0 ? groupWeight / sharers.length : 0;

  const perPerson: PersonLoad[] = facts.attendees.map((person) => {
    const personal = result.lines.filter((l) => l.person?.id === person.id);
    const carriesShare = sharers.some((p) => p.id === person.id);
    const weight_g =
      personal.reduce((sum, l) => sum + l.weight_g, 0) + (carriesShare ? share : 0);

    const recorded = person.bodyWeight_kg;
    const bodyWeight_kg = recorded ?? ASSUMED_BODY_WEIGHT[person.role] ?? 70;
    const ratio = bodyWeight_kg > 0 ? weight_g / 1000 / bodyWeight_kg : 0;

    return {
      person,
      weight_g,
      bodyWeight_kg,
      assumedBodyWeight: recorded === undefined,
      ratio,
      overLimit: ratio > PACK_WEIGHT_LIMIT,
      heaviest: [...personal].sort((a, b) => b.weight_g - a.weight_g).slice(0, 8),
    };
  });

  return {
    applies,
    perPerson,
    totalWeight_g: result.totalWeight_g,
    leftBehind: leftBehindLines,
    leftBehindWeight_g: leftBehindLines.reduce((sum, l) => sum + l.weight_g, 0),
  };
}

/**
 * Split a built list into what is going and what was deliberately dropped.
 * Left-behind items are returned rather than discarded: a decision is not the
 * same as an absence, and you should be able to see what you chose to drop.
 */
export function applyLeftBehind(
  lines: ListLine[],
  leftBehind: Id[],
): { going: ListLine[]; dropped: ListLine[] } {
  const dropped = new Set(leftBehind);
  return {
    going: lines.filter((l) => !dropped.has(l.item.id)),
    dropped: lines.filter((l) => dropped.has(l.item.id)),
  };
}

// ---------------------------------------------------------------------------
// The kid-facing list
// ---------------------------------------------------------------------------

export interface KidListEntry {
  key: string;
  name: string;
  /** Kept short and concrete: a six-year-old is not reading a rule trace. */
  hint?: string;
}

/**
 * A short list a child can own, in big text.
 *
 * Only their own things, capped, and phrased as jobs. Ownership builds
 * competence, and it occupies them during the boring part.
 */
export function kidList(result: BuildResult, personId: Id, limit = 12): KidListEntry[] {
  const theirs = result.lines.filter((l) => l.person?.id === personId);

  const entries = theirs
    // Comfort objects first: it is the one that ends trips.
    .sort((a, b) => {
      const rank = (l: ListLine) => (l.item.phase === 'last-out-door' ? 0 : 1);
      return rank(a) - rank(b) || a.item.name.localeCompare(b.item.name);
    })
    .slice(0, limit)
    .map((line) => ({
      key: line.key,
      name: line.qty > 1 ? `${line.item.name} (${line.qty})` : line.item.name,
      hint: line.item.phase === 'last-out-door' ? 'Right at the end, before we go' : undefined,
    }));

  return entries;
}

export function boatZoneBalance(groups: LoadZoneGroup[]): string | null {
  const weight = (zone: BoatZone) =>
    groups.find((g) => g.zone === zone)?.weight_g ?? 0;
  const bow = weight('bow');
  const stern = weight('stern');
  if (bow + stern === 0) return null;
  // Slightly stern-heavy tracks; bow-heavy will not turn.
  if (bow > stern * 1.3) {
    return `Bow is carrying ${Math.round(bow / 1000)} kg against ${Math.round(stern / 1000)} kg in the stern. Move weight aft — bow-heavy will not turn.`;
  }
  const deck = weight('deck' as BoatZone);
  if (deck > 4000) {
    return `${Math.round(deck / 1000)} kg on deck. That is windage and something for a wave to catch.`;
  }
  return null;
}
