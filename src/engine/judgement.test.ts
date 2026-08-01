import { describe, expect, it } from 'vitest';
import {
  applyCoverage,
  arrivalDaylight,
  jurisdictionNotes,
  roleClashes,
  seasonalHazards,
  splittableItems,
  suggestedCampRoles,
  tripPlanDocument,
} from './judgement';
import { buildList } from './build';
import { deriveFacts } from './facts';
import { evaluateGates } from './gates';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER, SOLO_BACKCOUNTRY_SHOULDER, WINTER_HIKE_IN } from '../data/fixtures';
import { migrate, SCHEMA_VERSION } from '../data/schema';
import type { Trip } from '../data/types';

const library = defaultLibrary();
const facts = deriveFacts(FAMILY_CAR_SUMMER, library);
const result = buildList(FAMILY_CAR_SUMMER, library);

const on = (startDate: string, trip: Trip = FAMILY_CAR_SUMMER) => ({ ...trip, startDate });

describe('jurisdiction prompts', () => {
  it('says plainly that it does not know when the land is unset', () => {
    const notes = jurisdictionNotes('unknown');
    expect(notes[0]!.text).toContain('does not know whose land');
  });

  it('covers fires, dogs and stay limits for BC Parks', () => {
    const topics = jurisdictionNotes('bc-parks').map((n) => n.topic);
    expect(topics).toContain('fires');
    expect(topics).toContain('dogs');
    expect(topics).toContain('stay-limit');
  });

  it('tells you to contact the Nation first on First Nations territory', () => {
    const notes = jurisdictionNotes('first-nations');
    expect(notes[0]!.topic).toBe('protocol');
    expect(notes[0]!.text).toContain('Contact the Nation');
  });

  it('raises unceded territory on Crown land rather than treating it as empty', () => {
    const protocol = jurisdictionNotes('crown-land').find((n) => n.topic === 'protocol')!;
    expect(protocol.text).toContain('unceded');
  });

  it('has something to say about every jurisdiction', () => {
    for (const j of ['unknown', 'bc-parks', 'rec-site', 'crown-land', 'first-nations', 'regional-park', 'private'] as const) {
      expect(jurisdictionNotes(j).length).toBeGreaterThan(0);
    }
  });
});

describe('seasonal hazards keyed to the dates', () => {
  const idsFor = (startDate: string) =>
    seasonalHazards(on(startDate), facts).map((h) => h.id);

  it('raises ticks in spring', () => {
    expect(idsFor('2026-04-10')).toContain('ticks');
    expect(idsFor('2026-09-10')).not.toContain('ticks');
  });

  it('raises freshet in the melt', () => {
    expect(idsFor('2026-06-01')).toContain('freshet');
    expect(idsFor('2026-09-01')).not.toContain('freshet');
  });

  it('distinguishes spring bears from fall bears', () => {
    expect(idsFor('2026-05-01')).toContain('bears-spring');
    expect(idsFor('2026-05-01')).not.toContain('bears-fall');
    expect(idsFor('2026-09-15')).toContain('bears-fall');
    expect(idsFor('2026-09-15')).not.toContain('bears-spring');
  });

  it('explains why fall bears are different, not just that they exist', () => {
    const fall = seasonalHazards(on('2026-09-15'), facts).find((h) => h.id === 'bears-fall')!;
    expect(fall.title).toContain('hyperphagia');
    expect(fall.detail).toContain('denning');
    expect(fall.check).toContain('scented');
  });

  it('raises wasps in late summer', () => {
    expect(idsFor('2026-08-20')).toContain('wasps');
  });

  it('raises fire season in the dry months', () => {
    expect(idsFor('2026-08-01')).toContain('fire-season');
  });

  it('raises winter conditions on the calendar or on the temperature', () => {
    expect(idsFor('2027-01-15')).toContain('winter-conditions');
    // A July trip that is below freezing is still a winter trip.
    const coldJuly = deriveFacts(
      { ...FAMILY_CAR_SUMMER, weather: { ...FAMILY_CAR_SUMMER.weather, overnightLow: -3 } },
      library,
    );
    expect(seasonalHazards(on('2026-07-10'), coldJuly).map((h) => h.id)).toContain(
      'winter-conditions',
    );
  });

  it('raises the ferry when the site questionnaire says there is one', () => {
    const ferryFacts = deriveFacts(
      { ...FAMILY_CAR_SUMMER, site: { ...FAMILY_CAR_SUMMER.site, ferryCrossing: true } },
      library,
    );
    expect(seasonalHazards(FAMILY_CAR_SUMMER, ferryFacts).map((h) => h.id)).toContain('ferry');
  });

  it('returns nothing rather than throwing on a malformed date', () => {
    expect(seasonalHazards({ ...FAMILY_CAR_SUMMER, startDate: '' }, facts)).toEqual([]);
  });
});

describe('arrival daylight', () => {
  it('says you will be setting up in the dark on a long autumn drive', () => {
    const arrival = arrivalDaylight({ ...FAMILY_CAR_SUMMER, startDate: '2026-10-25', driveHours: 8 }, 49.3);
    expect(arrival!.setupInDark).toBe(true);
  });

  it('is relaxed about a short summer drive', () => {
    const arrival = arrivalDaylight(FAMILY_CAR_SUMMER, 49.3);
    expect(arrival!.setupInDark).toBe(false);
    expect(arrival!.sunset).toMatch(/^\d\d:\d\d$/);
  });

  it('returns nothing rather than guessing without a latitude', () => {
    expect(arrivalDaylight(FAMILY_CAR_SUMMER, null)).toBeNull();
  });
});

describe('the trip plan document', () => {
  it('is complete for a fixture that filled it in', () => {
    const doc = tripPlanDocument(FAMILY_CAR_SUMMER, library, facts, result);
    expect(doc.complete).toBe(true);
    expect(doc.missing).toEqual([]);
  });

  it('names exactly what is missing rather than just failing', () => {
    const bare: Trip = {
      ...FAMILY_CAR_SUMMER,
      location: '',
      plan: {
        routeNotes: '',
        bailOutPoints: '',
        nearestHospital: '',
        contactName: '',
        contactPhone: '',
        overdue: '',
      },
    };
    const doc = tripPlanDocument(bare, library, facts, result);
    expect(doc.complete).toBe(false);
    expect(doc.missing).toContain('bail-out points');
    expect(doc.missing).toContain('when to worry');
  });

  it('reads as something a non-camper can act on', () => {
    const doc = tripPlanDocument(FAMILY_CAR_SUMMER, library, facts, result);
    expect(doc.text).toContain('IF YOU HAVE NOT HEARD FROM US');
    expect(doc.text).toContain('RCMP');
    expect(doc.text).toContain('Squamish General');
  });

  it('states the communications situation plainly when there is none', () => {
    const winterFacts = deriveFacts(WINTER_HIKE_IN, library);
    const stripped = {
      ...library,
      items: library.items.filter((i) => i.id !== 'satellite-messenger'),
    };
    const built = buildList(WINTER_HIKE_IN, stripped);
    const doc = tripPlanDocument(WINTER_HIKE_IN, stripped, winterFacts, built);
    expect(doc.text).toContain('We cannot call out');
  });

  it('carries the medical facts the party would need read out', () => {
    const medical = structuredClone(library);
    medical.people.find((p) => p.id === 'p-kid-1')!.allergies = ['peanuts'];
    medical.people.find((p) => p.id === 'p-adult-1')!.medications = ['ventolin'];
    const doc = tripPlanDocument(
      FAMILY_CAR_SUMMER,
      medical,
      deriveFacts(FAMILY_CAR_SUMMER, medical),
      result,
    );
    expect(doc.text).toContain('MEDICAL');
    expect(doc.text).toContain('allergic to peanuts');
    expect(doc.text).toContain('takes ventolin');
  });

  it('passes the app s own warnings on to whoever holds the plan', () => {
    const winterFacts = deriveFacts(WINTER_HIKE_IN, library);
    const built = buildList(WINTER_HIKE_IN, library);
    const gates = evaluateGates(WINTER_HIKE_IN, winterFacts, built);
    const doc = tripPlanDocument(WINTER_HIKE_IN, library, winterFacts, built, gates);
    expect(doc.text).toContain('THE APP FLAGGED');
    expect(doc.text).toContain('avalanche terrain');
  });

  it('says the judgement is the party s own, not the app s', () => {
    const doc = tripPlanDocument(FAMILY_CAR_SUMMER, library, facts, result);
    expect(doc.text).toContain('the judgement are the party');
  });
});

describe('multi-household coverage', () => {
  const withOther: Trip = {
    ...FAMILY_CAR_SUMMER,
    households: [{ id: 'h-nguyen', name: 'The Nguyens' }],
    coveredBy: { 'stove-two-burner': 'h-nguyen', 'camp-table': 'h-nguyen' },
  };

  it('moves covered items out of our list', () => {
    const coverage = applyCoverage(result.lines, withOther);
    expect(coverage.ours.some((l) => l.item.id === 'stove-two-burner')).toBe(false);
    expect(coverage.theirs.map((t) => t.line.item.id)).toContain('stove-two-burner');
  });

  it('names who is bringing it, so it is visible rather than absent', () => {
    const coverage = applyCoverage(result.lines, withOther);
    expect(coverage.theirs[0]!.householdName).toBe('The Nguyens');
  });

  it('reports the weight somebody else is carrying', () => {
    const coverage = applyCoverage(result.lines, withOther);
    expect(coverage.savedWeight_g).toBeGreaterThan(0);
  });

  it('ignores a coverage pointing at a household that was deleted', () => {
    const dangling: Trip = { ...withOther, households: [] };
    const coverage = applyCoverage(result.lines, dangling);
    // Better to pack a second stove than to leave the only one behind.
    expect(coverage.theirs).toEqual([]);
    expect(coverage.ours.some((l) => l.item.id === 'stove-two-burner')).toBe(true);
  });

  it('offers only group gear for splitting', () => {
    const splittable = splittableItems(result.lines);
    expect(splittable.every((l) => l.item.ownership === 'group')).toBe(true);
    expect(splittable.some((l) => l.item.id === 'sleeping-bag')).toBe(false);
    expect(splittable.some((l) => l.item.id === 'stove-two-burner')).toBe(true);
  });

  it('changes nothing when nobody else is coming', () => {
    const coverage = applyCoverage(result.lines, FAMILY_CAR_SUMMER);
    expect(coverage.theirs).toEqual([]);
    expect(coverage.ours).toHaveLength(result.lines.length);
  });
});

describe('camp roles', () => {
  it('suggests a cook and a dishwasher for every dinner', () => {
    const suggestions = suggestedCampRoles([
      { dayIndex: 0, label: 'Day 1', mealName: 'Chili' },
      { dayIndex: 1, label: 'Day 2', mealName: 'Tacos' },
    ]);
    expect(suggestions).toHaveLength(4);
    expect(suggestions.filter((s) => s.job === 'cook')).toHaveLength(2);
  });

  it('objects when one person cooks and does the dishes on the same day', () => {
    const clashes = roleClashes(
      [
        { job: 'cook', dayIndex: 1, personId: 'p-adult-1' },
        { job: 'dishes', dayIndex: 1, personId: 'p-adult-1' },
      ],
      library,
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toContain('Adult 1');
  });

  it('is content when the jobs are split', () => {
    const clashes = roleClashes(
      [
        { job: 'cook', dayIndex: 1, personId: 'p-adult-1' },
        { job: 'dishes', dayIndex: 1, personId: 'p-adult-2' },
      ],
      library,
    );
    expect(clashes).toEqual([]);
  });

  it('says nothing about unassigned roles', () => {
    expect(roleClashes([{ job: 'cook', dayIndex: 1 }, { job: 'dishes', dayIndex: 1 }], library)).toEqual([]);
  });
});

describe('schema migration v3 to v4', () => {
  it('gives old trips a blank plan and an unknown jurisdiction', () => {
    const old = {
      schemaVersion: 3,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [], meals: [], pantry: {} },
      trips: [{ id: 't1', name: 'Old', mealPlan: [], packedBy: {}, leftBehind: [] }],
    };
    const result2 = migrate<{ schemaVersion: number; trips: Trip[] }>(old);
    expect(result2.data.trips[0]!.jurisdiction).toBe('unknown');
    expect(result2.data.trips[0]!.plan.routeNotes).toBe('');
    expect(result2.data.trips[0]!.coveredBy).toEqual({});
    expect(result2.data.trips[0]!.households).toEqual([]);
  });

  it('strips the old library-scoped coveredBy, which had the wrong lifetime', () => {
    const old = {
      schemaVersion: 3,
      library: {
        items: [{ id: 'i1', name: 'Stove', coveredBy: 'the-other-family' }],
        containers: [],
        activities: [],
        people: [],
        vehicles: [],
        meals: [],
        pantry: {},
      },
      trips: [],
    };
    const migrated = migrate<{ schemaVersion: number; library: { items: Record<string, unknown>[] } }>(old as never);
    expect(migrated.data.library.items[0]!.coveredBy).toBeUndefined();
  });

  it('carries a v1 backup through all four versions', () => {
    const ancient = {
      schemaVersion: 1,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [] },
      trips: [{ id: 't1', name: 'Ancient' }],
    };
    const migrated = migrate<{ schemaVersion: number; trips: Trip[] }>(ancient);
    expect(migrated.applied).toHaveLength(3);
    expect(migrated.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.data.trips[0]!.mealPlan).toEqual([]);
    expect(migrated.data.trips[0]!.packedBy).toEqual({});
    expect(migrated.data.trips[0]!.jurisdiction).toBe('unknown');
  });
});

describe('solo backcountry gets the same scrutiny', () => {
  it('flags a missing plan on the trip that most needs one', () => {
    const soloFacts = deriveFacts(SOLO_BACKCOUNTRY_SHOULDER, library);
    const built = buildList(SOLO_BACKCOUNTRY_SHOULDER, library);
    const doc = tripPlanDocument(SOLO_BACKCOUNTRY_SHOULDER, library, soloFacts, built);
    expect(doc.complete).toBe(false);
    expect(doc.missing).toContain('who to call');
  });
});
