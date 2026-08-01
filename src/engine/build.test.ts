import { describe, expect, it } from 'vitest';
import { buildList, groupLines } from './build';
import { diffLists } from './diff';
import { evaluateGates, listIsQualified } from './gates';
import { deriveFacts } from './facts';
import { defaultLibrary } from '../data/library';
import {
  FAMILY_CAR_SUMMER,
  KAYAK_TRIP,
  NOBODY,
  SOLO_BACKCOUNTRY_SHOULDER,
  WINTER_HIKE_IN,
  ZERO_NIGHTS,
} from '../data/fixtures';
import type { Library } from '../data/types';

const library = defaultLibrary();
const has = (r: ReturnType<typeof buildList>, id: string) => r.lines.some((l) => l.item.id === id);
const qtyOf = (r: ReturnType<typeof buildList>, id: string) =>
  r.lines.filter((l) => l.item.id === id).reduce((s, l) => s + l.qty, 0);

describe('buildList — family car camping in summer', () => {
  const result = buildList(FAMILY_CAR_SUMMER, library);

  it('produces a list', () => {
    expect(result.lines.length).toBeGreaterThan(40);
  });

  it('packs the tarp, because rain is the default assumption', () => {
    expect(has(result, 'tarp-poly')).toBe(true);
  });

  it('packs one tent for one shelter', () => {
    expect(qtyOf(result, 'tent')).toBe(1);
  });

  it('packs two tents when the sleeping arrangement has two', () => {
    const twoTents = buildList(
      {
        ...FAMILY_CAR_SUMMER,
        shelters: [
          { id: 'a', name: 'Adults', occupantIds: ['p-adult-1', 'p-adult-2'] },
          { id: 'b', name: 'Kids', occupantIds: ['p-kid-1', 'p-kid-2'] },
        ],
      },
      library,
    );
    expect(qtyOf(twoTents, 'tent')).toBe(2);
    expect(qtyOf(twoTents, 'lantern')).toBe(3); // one each plus the kitchen
  });

  it('does not pack the backpacking stove on a vehicle trip', () => {
    expect(has(result, 'stove-backpacking')).toBe(false);
    expect(has(result, 'stove-two-burner')).toBe(true);
  });

  it('does not pack water jugs when the site has drinking water', () => {
    expect(has(result, 'water-jugs')).toBe(false);
  });

  it('packs the folding table only when there is no picnic table', () => {
    expect(has(result, 'camp-table')).toBe(false);
    const noTable = buildList(
      { ...FAMILY_CAR_SUMMER, site: { ...FAMILY_CAR_SUMMER.site, picnicTableAndFireRing: false } },
      library,
    );
    expect(has(noTable, 'camp-table')).toBe(true);
  });

  it('issues comfort objects to each kid, and puts them last out the door', () => {
    const comfort = result.lines.filter((l) => l.item.id === 'comfort-object');
    expect(comfort).toHaveLength(2);
    expect(comfort.every((l) => l.item.phase === 'last-out-door')).toBe(true);
    expect(comfort.map((l) => l.person?.role).sort()).toEqual(['kid', 'toddler']);
  });

  it('issues diapers only to the toddler', () => {
    const diapers = result.lines.filter((l) => l.item.id === 'diapers');
    expect(diapers).toHaveLength(1);
    expect(diapers[0]!.person?.role).toBe('toddler');
    expect(diapers[0]!.qty).toBe(26); // 2 + 6 x 4 days
  });

  it('does not pack the kayak without a kayak rack', () => {
    expect(has(result, 'kayak')).toBe(false);
  });

  it('every line carries the trace that put it there', () => {
    for (const line of result.lines) {
      expect(line.why.passed).toBe(true);
      expect(line.why.english.length).toBeGreaterThan(0);
      expect(line.howMany.english.length).toBeGreaterThan(0);
    }
  });

  it('records why each excluded item was excluded', () => {
    expect(result.excluded.length).toBeGreaterThan(0);
    for (const ex of result.excluded) expect(ex.why.passed).toBe(false);
  });
});

describe('buildList — solo backcountry, shoulder season', () => {
  const result = buildList(SOLO_BACKCOUNTRY_SHOULDER, library);

  it('carries weight rather than volume: no two-burner stove, no chairs', () => {
    expect(has(result, 'stove-two-burner')).toBe(false);
    expect(has(result, 'camp-chairs')).toBe(false);
    expect(has(result, 'stove-backpacking')).toBe(true);
  });

  it('packs the bear hang, not the bear canister, on a carried trip in bear country', () => {
    expect(has(result, 'bear-hang-kit')).toBe(true);
  });

  it('packs the water filter and the tablets as separate redundancy tiers', () => {
    expect(has(result, 'water-filter')).toBe(true);
    expect(has(result, 'purification-tablets')).toBe(true);
  });

  it('packs three ways to make fire', () => {
    expect(has(result, 'lighter')).toBe(true);
    expect(has(result, 'matches-waterproof')).toBe(true);
    expect(has(result, 'ferro-rod')).toBe(true);
  });

  it('packs navigation that does not need a battery', () => {
    expect(has(result, 'paper-map')).toBe(true);
    expect(has(result, 'compass')).toBe(true);
  });

  it('reports a total weight', () => {
    expect(result.totalWeight_g).toBeGreaterThan(0);
  });
});

describe('buildList — winter', () => {
  const result = buildList(WINTER_HIKE_IN, library);
  const facts = deriveFacts(WINTER_HIKE_IN, library);

  it('forces the winter travel kit in', () => {
    expect(has(result, 'avalanche-transceiver')).toBe(true);
    expect(has(result, 'avalanche-probe')).toBe(true);
    expect(has(result, 'avalanche-shovel')).toBe(true);
  });

  it('issues one transceiver per person', () => {
    expect(result.lines.filter((l) => l.item.id === 'avalanche-transceiver')).toHaveLength(2);
  });

  it('raises a blocking gate that names what the app cannot know', () => {
    const gates = evaluateGates(WINTER_HIKE_IN, facts, result);
    const winter = gates.find((g) => g.id === 'winter-travel');
    expect(winter?.severity).toBe('blocking');
    expect(winter?.disclaimer).toContain('cannot assess avalanche terrain');
    expect(winter?.reference).toBe('avalanche.ca');
    expect(listIsQualified(gates)).toBe(true);
  });

  it('still produces the list — a withheld list gets packed from memory instead', () => {
    expect(result.lines.length).toBeGreaterThan(20);
  });

  it('warns when there is no cell service and no messenger', () => {
    const stripped: Library = {
      ...library,
      items: library.items.filter((i) => i.id !== 'satellite-messenger'),
    };
    const r = buildList(WINTER_HIKE_IN, stripped);
    const gates = evaluateGates(WINTER_HIKE_IN, deriveFacts(WINTER_HIKE_IN, stripped), r);
    expect(gates.some((g) => g.id === 'no-comms')).toBe(true);
  });

  it('packs no sunscreen at minus eight', () => {
    expect(has(result, 'sunscreen')).toBe(false);
  });
});

describe('buildList — kayak', () => {
  const result = buildList(KAYAK_TRIP, library);

  it('packs the boat because the rack is fitted', () => {
    expect(has(result, 'kayak')).toBe(true);
  });

  it('does not pack the boat when the rack comes off', () => {
    const noRack = buildList({ ...KAYAK_TRIP, rackIds: ['roof-rack'] }, library);
    expect(has(noRack, 'kayak')).toBe(false);
    // The paddles still go: they are not rack-gated, and that is a real
    // modelling choice, not an oversight.
    expect(has(noRack, 'paddle')).toBe(true);
  });

  it('packs one spare paddle', () => {
    expect(qtyOf(result, 'paddle')).toBe(3); // 1 + 1 per person, 2 people
  });

  it('issues a PFD to every person', () => {
    expect(result.lines.filter((l) => l.item.id === 'pfd')).toHaveLength(2);
  });
});

describe('buildList — degenerate cases', () => {
  it('nobody selected: no per-person lines, no crash, group gear still resolves', () => {
    const result = buildList(NOBODY, library);
    expect(result.lines.every((l) => !l.person)).toBe(true);
    expect(has(result, 'first-aid-kit')).toBe(true);
    expect(has(result, 'comfort-object')).toBe(false);
  });

  it('zero nights: per-night items collapse to their base', () => {
    const result = buildList(ZERO_NIGHTS, library);
    expect(qtyOf(result, 'propane-canister')).toBe(1);
    expect(has(result, 'power-bank')).toBe(false); // requires at least one night
  });

  it('empty library: an empty list, not an exception', () => {
    const empty: Library = { ...library, items: [] };
    const result = buildList(FAMILY_CAR_SUMMER, empty);
    expect(result.lines).toEqual([]);
    expect(result.totalWeight_g).toBe(0);
  });

  it('an item with no conditions is quarantined, not promoted to every trip', () => {
    const sabotaged: Library = {
      ...library,
      items: [
        ...library.items,
        {
          ...library.items[0]!,
          id: 'stripped-item',
          name: 'Item whose activity was deleted',
          rule: { mode: 'all', conds: [] } as never,
        },
      ],
    };
    const result = buildList(FAMILY_CAR_SUMMER, sabotaged);
    expect(has(result, 'stripped-item')).toBe(false);
    expect(result.orphaned.map((i) => i.id)).toContain('stripped-item');
  });
});

describe('grouping', () => {
  const result = buildList(FAMILY_CAR_SUMMER, library);

  it('groups by container with real container names', () => {
    const groups = groupLines(result.lines, 'container', library);
    expect(groups.some((g) => g.label === 'Kitchen bin')).toBe(true);
    expect(groups.every((g) => g.lines.length > 0)).toBe(true);
  });

  it('groups by category', () => {
    const groups = groupLines(result.lines, 'category', library);
    expect(groups.some((g) => g.key === 'shelter')).toBe(true);
  });

  it('groups by person, with shared gear kept separate', () => {
    const groups = groupLines(result.lines, 'person', library);
    expect(groups.some((g) => g.label === 'Group gear')).toBe(true);
    expect(groups.some((g) => g.label === 'Adult 1')).toBe(true);
  });

  it('groups by phase for the timeline', () => {
    const groups = groupLines(result.lines, 'phase', library);
    expect(groups.some((g) => g.key === 'last-out-door')).toBe(true);
    expect(groups.some((g) => g.key === 'weeks-out')).toBe(true);
  });

  it('every line lands in exactly one group, whatever the axis', () => {
    for (const by of ['container', 'category', 'person', 'phase'] as const) {
      const total = groupLines(result.lines, by, library).reduce((s, g) => s + g.lines.length, 0);
      expect(total).toBe(result.lines.length);
    }
  });
});

describe('diff — how the model becomes legible', () => {
  it('reports what changed when an input changes', () => {
    const before = buildList(FAMILY_CAR_SUMMER, library);
    const after = buildList(
      { ...FAMILY_CAR_SUMMER, weather: { ...FAMILY_CAR_SUMMER.weather, precip: 'heavy' } },
      library,
    );
    const diff = diffLists(before, after);
    expect(diff.added.some((l) => l.item.id === 'rain-pants')).toBe(true);
    expect(diff.summary).toMatch(/^\+\d/);
  });

  it('reports quantity changes rather than an add plus a remove', () => {
    const before = buildList(FAMILY_CAR_SUMMER, library);
    const after = buildList({ ...FAMILY_CAR_SUMMER, endDate: '2026-07-16' }, library);
    const diff = diffLists(before, after);
    expect(diff.changed.some((c) => c.after.item.id === 'propane-canister')).toBe(true);
  });

  it('says so plainly when nothing changed', () => {
    const a = buildList(FAMILY_CAR_SUMMER, library);
    const b = buildList(FAMILY_CAR_SUMMER, library);
    expect(diffLists(a, b).summary).toBe('no change');
  });
});
