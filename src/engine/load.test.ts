import { describe, expect, it } from 'vitest';
import {
  applyLeftBehind,
  boatZoneBalance,
  byResponsibility,
  kidList,
  loadPlan,
  packerFor,
  PACK_WEIGHT_LIMIT,
  shakedown,
  zoneFor,
} from './load';
import { buildList } from './build';
import { deriveFacts } from './facts';
import { defaultLibrary } from '../data/library';
import {
  FAMILY_CAR_SUMMER,
  KAYAK_TRIP,
  SOLO_BACKCOUNTRY_SHOULDER,
} from '../data/fixtures';
import { migrate, SCHEMA_VERSION } from '../data/schema';
import type { Library, Trip } from '../data/types';

const library = defaultLibrary();
const family = buildList(FAMILY_CAR_SUMMER, library);
const solo = buildList(SOLO_BACKCOUNTRY_SHOULDER, library);
const kayak = buildList(KAYAK_TRIP, library);

const lineFor = (result: typeof family, id: string) =>
  result.lines.find((l) => l.item.id === id)!;

describe('zone resolution', () => {
  it('reads the container zone for a vehicle', () => {
    expect(zoneFor(lineFor(family, 'kitchen-bin' as string) ?? family.lines[0]!, 'vehicle', library)).toBeTruthy();
    expect(zoneFor(lineFor(family, 'stove-two-burner'), 'vehicle', library)).toBe('boot-front');
  });

  it('puts weight low and forward', () => {
    expect(zoneFor(lineFor(family, 'cooler'), 'vehicle', library)).toBe('boot-rear');
    expect(zoneFor(lineFor(family, 'tent'), 'vehicle', library)).toBe('boot-front');
  });

  it('gives the first aid kit a reachable zone in every transport', () => {
    const line = lineFor(family, 'first-aid-kit');
    expect(zoneFor(line, 'vehicle', library)).toBe('cabin-front');
    expect(zoneFor(line, 'carried', library)).toBe('lid');
    expect(zoneFor(line, 'boat', library)).toBe('day-hatch');
  });

  it('falls back to the category for a pack when the container has no answer', () => {
    const sleepingBag = solo.lines.find((l) => l.item.id === 'sleeping-bag')!;
    expect(zoneFor(sleepingBag, 'carried', library)).toBe('bottom');
  });

  it('lets an explicit item packZone win over everything', () => {
    const custom: Library = {
      ...library,
      items: library.items.map((i) =>
        i.id === 'sleeping-bag' ? { ...i, packZone: 'lid' as const } : i,
      ),
    };
    const built = buildList(SOLO_BACKCOUNTRY_SHOULDER, custom);
    const bag = built.lines.find((l) => l.item.id === 'sleeping-bag')!;
    expect(zoneFor(bag, 'carried', custom)).toBe('lid');
  });

  it('gives actions no zone — they are not loaded anywhere', () => {
    const action = family.lines.find((l) => l.item.type === 'action')!;
    expect(zoneFor(action, 'vehicle', library)).toBeNull();
  });

  it('reports an unmapped container rather than guessing', () => {
    const orphanContainer: Library = {
      ...library,
      containers: library.containers.map((c) =>
        c.id === 'kitchen-bin' ? { ...c, zones: {} } : c,
      ),
    };
    const built = buildList(FAMILY_CAR_SUMMER, orphanContainer);
    expect(zoneFor(
      built.lines.find((l) => l.item.container === 'kitchen-bin')!,
      'vehicle',
      orphanContainer,
    )).toBeNull();
  });
});

describe('the load plan', () => {
  it('orders vehicle zones nose-first', () => {
    const plan = loadPlan(family.lines, 'vehicle', library);
    const zones = plan.map((g) => g.zone);
    expect(zones.indexOf('roof')).toBeLessThan(zones.indexOf('boot-front'));
    expect(zones.indexOf('boot-front')).toBeLessThan(zones.indexOf('boot-rear'));
  });

  it('carries the note that says why a zone is what it is', () => {
    const plan = loadPlan(family.lines, 'vehicle', library);
    const bootFront = plan.find((g) => g.zone === 'boot-front')!;
    expect(bootFront.note).toContain('Heavy, low and forward');
  });

  it('reports a weight per zone', () => {
    const plan = loadPlan(family.lines, 'vehicle', library);
    expect(plan.every((g) => g.weight_g >= 0)).toBe(true);
    expect(plan.reduce((s, g) => s + g.weight_g, 0)).toBeGreaterThan(0);
  });

  it('switches to pack zones for the same list, because you drive to trailheads', () => {
    const vehicle = loadPlan(solo.lines, 'vehicle', library).map((g) => g.zone);
    const carried = loadPlan(solo.lines, 'carried', library).map((g) => g.zone);
    expect(carried).toContain('core');
    expect(vehicle).not.toContain('core');
  });

  it('puts kayak gear in boat zones', () => {
    const plan = loadPlan(kayak.lines, 'boat', library).map((g) => g.zone);
    expect(plan).toContain('day-hatch');
    expect(plan).toContain('stern');
  });

  it('leaves actions out of the plan entirely', () => {
    const plan = loadPlan(family.lines, 'vehicle', library);
    const all = plan.flatMap((g) => g.lines);
    expect(all.some((l) => l.item.type === 'action')).toBe(false);
  });

  it('surfaces an unassigned bucket last rather than hiding it', () => {
    const broken: Library = {
      ...library,
      containers: library.containers.map((c) =>
        c.id === 'kitchen-bin' ? { ...c, zones: {} } : c,
      ),
    };
    const built = buildList(FAMILY_CAR_SUMMER, broken);
    const plan = loadPlan(built.lines, 'vehicle', broken);
    expect(plan[plan.length - 1]!.zone).toBe('unassigned');
  });
});

describe('boat trim', () => {
  it('says nothing when the boat is balanced', () => {
    const plan = loadPlan(kayak.lines, 'boat', library);
    const message = boatZoneBalance(plan);
    if (message) expect(message).toMatch(/bow|deck/i);
  });

  it('complains when the bow is much heavier than the stern', () => {
    const plan = [
      { zone: 'bow' as const, label: '', note: '', lines: [], weight_g: 30000 },
      { zone: 'stern' as const, label: '', note: '', lines: [], weight_g: 10000 },
    ];
    expect(boatZoneBalance(plan)).toContain('will not turn');
  });
});

describe('responsibility — who packs it, not whose it is', () => {
  it('resolves from the container assignment', () => {
    const line = lineFor(family, 'stove-two-burner');
    expect(packerFor(line, FAMILY_CAR_SUMMER)).toBe('p-adult-1');
  });

  it('lets an item-level assignment override the container', () => {
    const trip: Trip = {
      ...FAMILY_CAR_SUMMER,
      packedBy: { ...FAMILY_CAR_SUMMER.packedBy, 'stove-two-burner': 'p-adult-2' },
    };
    expect(packerFor(lineFor(family, 'stove-two-burner'), trip)).toBe('p-adult-2');
  });

  it('returns nobody when neither is assigned', () => {
    expect(packerFor(lineFor(family, 'first-aid-kit'), FAMILY_CAR_SUMMER)).toBeNull();
  });

  it('groups by packer, with the unassigned pile last', () => {
    const groups = byResponsibility(family.lines, FAMILY_CAR_SUMMER, library);
    expect(groups[groups.length - 1]!.label).toBe('Nobody has this yet');
    expect(groups.some((g) => g.label === 'Adult 1')).toBe(true);
  });

  it('is not the same axis as ownership', () => {
    // The sleeping bags are personal, but Adult 2 packs the whole duffel.
    const groups = byResponsibility(family.lines, FAMILY_CAR_SUMMER, library);
    const adult2 = groups.find((g) => g.label === 'Adult 2')!;
    const bagsInAdult2 = adult2.lines.filter((l) => l.item.id === 'sleeping-bag');
    expect(bagsInAdult2.length).toBe(4);
    expect(bagsInAdult2.every((l) => l.item.ownership === 'personal')).toBe(true);
  });
});

describe('the shakedown pass', () => {
  const soloFacts = deriveFacts(SOLO_BACKCOUNTRY_SHOULDER, library);
  const familyFacts = deriveFacts(FAMILY_CAR_SUMMER, library);

  it('does not apply on a vehicle trip', () => {
    expect(shakedown(family, familyFacts).applies).toBe(false);
  });

  it('applies to the transport being looked at, not the trip s own', () => {
    // You drive to a trailhead: the pack weight question is live even though
    // the trip itself is a vehicle trip.
    expect(shakedown(family, familyFacts, [], 'carried').applies).toBe(true);
    expect(shakedown(solo, soloFacts, [], 'vehicle').applies).toBe(false);
  });

  it('applies when somebody is carrying the load', () => {
    expect(shakedown(solo, soloFacts).applies).toBe(true);
  });

  it('gives each person a weight and a ratio', () => {
    const pass = shakedown(solo, soloFacts);
    expect(pass.perPerson).toHaveLength(1);
    expect(pass.perPerson[0]!.weight_g).toBeGreaterThan(0);
    expect(pass.perPerson[0]!.ratio).toBeGreaterThan(0);
  });

  it('flags a pack over a fifth of body weight', () => {
    const light = structuredClone(library);
    light.people.find((p) => p.id === 'p-adult-1')!.bodyWeight_kg = 40;
    const built = buildList(SOLO_BACKCOUNTRY_SHOULDER, light);
    const pass = shakedown(built, deriveFacts(SOLO_BACKCOUNTRY_SHOULDER, light));
    expect(pass.perPerson[0]!.overLimit).toBe(true);
    expect(pass.perPerson[0]!.ratio).toBeGreaterThan(PACK_WEIGHT_LIMIT);
  });

  it('says when it had to assume a body weight rather than pretending to know', () => {
    const pass = shakedown(solo, soloFacts);
    expect(pass.perPerson[0]!.assumedBodyWeight).toBe(true);
  });

  it('uses a recorded body weight when there is one', () => {
    const known = structuredClone(library);
    known.people.find((p) => p.id === 'p-adult-1')!.bodyWeight_kg = 82;
    const built = buildList(SOLO_BACKCOUNTRY_SHOULDER, known);
    const pass = shakedown(built, deriveFacts(SOLO_BACKCOUNTRY_SHOULDER, known));
    expect(pass.perPerson[0]!.bodyWeight_kg).toBe(82);
    expect(pass.perPerson[0]!.assumedBodyWeight).toBe(false);
  });

  it('divides group gear among the adults, not the toddlers', () => {
    const facts = deriveFacts(FAMILY_CAR_SUMMER, library);
    const pass = shakedown(family, facts);
    const adults = pass.perPerson.filter((p) => p.person.role === 'adult');
    const toddler = pass.perPerson.find((p) => p.person.role === 'toddler')!;
    const kidPersonal = family.lines
      .filter((l) => l.person?.id === toddler.person.id)
      .reduce((s, l) => s + l.weight_g, 0);
    expect(toddler.weight_g).toBe(kidPersonal);
    expect(adults.every((a) => a.weight_g > kidPersonal)).toBe(true);
  });

  it('offers the heaviest personal items as the candidates to drop', () => {
    const pass = shakedown(solo, soloFacts);
    const heaviest = pass.perPerson[0]!.heaviest;
    for (let i = 1; i < heaviest.length; i += 1) {
      expect(heaviest[i - 1]!.weight_g).toBeGreaterThanOrEqual(heaviest[i]!.weight_g);
    }
  });
});

describe('leaving things behind', () => {
  it('separates what is going from what was dropped, keeping both', () => {
    const { going, dropped } = applyLeftBehind(solo.lines, ['screen-shelter', 'sleeping-pad']);
    expect(dropped.every((l) => ['screen-shelter', 'sleeping-pad'].includes(l.item.id))).toBe(true);
    expect(going.some((l) => l.item.id === 'sleeping-pad')).toBe(false);
    expect(going.length + dropped.length).toBe(solo.lines.length);
  });

  it('drops nothing when nothing is chosen', () => {
    const { going, dropped } = applyLeftBehind(solo.lines, []);
    expect(dropped).toEqual([]);
    expect(going).toHaveLength(solo.lines.length);
  });

  it('reports the weight saved', () => {
    const { dropped } = applyLeftBehind(solo.lines, ['sleeping-pad']);
    const pass = shakedown(solo, deriveFacts(SOLO_BACKCOUNTRY_SHOULDER, library), dropped);
    expect(pass.leftBehindWeight_g).toBeGreaterThan(0);
  });
});

describe('the kid-facing list', () => {
  const kid = library.people.find((p) => p.role === 'kid')!;

  it('contains only that child s own things', () => {
    const list = kidList(family, kid.id);
    expect(list.length).toBeGreaterThan(0);
    const theirKeys = family.lines
      .filter((l) => l.person?.id === kid.id)
      .map((l) => l.key);
    expect(list.every((e) => theirKeys.includes(e.key))).toBe(true);
  });

  it('is short enough for a six-year-old to finish', () => {
    expect(kidList(family, kid.id).length).toBeLessThanOrEqual(12);
  });

  it('puts the comfort object first, because it is the one that ends trips', () => {
    const list = kidList(family, kid.id);
    expect(list[0]!.name).toContain('Comfort object');
    expect(list[0]!.hint).toContain('Right at the end');
  });

  it('folds the quantity into the name rather than showing a rule', () => {
    const list = kidList(family, kid.id);
    const socks = list.find((e) => e.name.startsWith('Wool socks'));
    if (socks) expect(socks.name).toMatch(/\(\d+\)/);
  });

  it('is empty for somebody with no personal items', () => {
    expect(kidList(family, 'nobody-at-all')).toEqual([]);
  });
});

describe('schema migration v2 to v3', () => {
  it('adds the responsibility map and the left-behind list to old trips', () => {
    const old = {
      schemaVersion: 2,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [], meals: [], pantry: {} },
      trips: [{ id: 't1', name: 'Old trip', mealPlan: [] }],
    };
    const result = migrate<{ schemaVersion: number; trips: Trip[] }>(old);
    expect(result.data.trips[0]!.packedBy).toEqual({});
    expect(result.data.trips[0]!.leftBehind).toEqual([]);
    expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('carries a v1 backup all the way forward through both migrations', () => {
    const ancient = {
      schemaVersion: 1,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [] },
      trips: [{ id: 't1', name: 'Ancient' }],
    };
    const result = migrate<{ schemaVersion: number; library: Library; trips: Trip[] }>(ancient);
    expect(result.applied).toHaveLength(2);
    expect(result.data.library.meals).toEqual([]);
    expect(result.data.trips[0]!.mealPlan).toEqual([]);
    expect(result.data.trips[0]!.packedBy).toEqual({});
  });

  it('migrates old containers from loadZone to the per-transport zones', () => {
    const old = {
      schemaVersion: 2,
      library: {
        items: [],
        containers: [{ id: 'c1', name: 'Bin', loadZone: 'rear-floor' }],
        activities: [],
        people: [],
        vehicles: [],
        meals: [],
        pantry: {},
      },
      trips: [],
    };
    const result = migrate<{ schemaVersion: number; library: Library }>(old);
    expect(result.data.library.containers[0]!.zones?.vehicle).toBe('boot-front');
  });
});
