import { describe, expect, it } from 'vitest';
import { lintLibrary } from './lint';
import { defaultLibrary } from '../data/library';
import { migrate, parseBackup, serializeBackup, makeBackup, SCHEMA_VERSION } from '../data/schema';
import { FAMILY_CAR_SUMMER } from '../data/fixtures';
import { slugify, uniqueId, counterId } from '../data/ids';
import type { Item, Library, Rule } from '../data/types';

const library = defaultLibrary();
const withItem = (overrides: Partial<Item>): Library => ({
  ...library,
  items: [{ ...library.items[0]!, id: 'test-item', name: 'Test item', ...overrides }],
});

describe('the shipped library is clean', () => {
  const findings = lintLibrary(library);

  it('has no errors', () => {
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.map((e) => `${e.itemId}: ${e.message}`)).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = library.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never names a specific person in a rule — roles carry the behaviour', () => {
    const namesAPerson = library.items.filter((item) =>
      JSON.stringify(item.rule).includes('"person"'),
    );
    expect(namesAPerson.map((i) => i.id)).toEqual([]);
  });

  it('survives deleting every seed person', () => {
    const peopleless: Library = { ...library, people: [] };
    const errors = lintLibrary(peopleless).filter((f) => f.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('assigns every item to a container that exists', () => {
    const missing = findings.filter((f) => f.code === 'missing-container');
    expect(missing).toEqual([]);
  });

  it('references only activities that exist', () => {
    const dangling = findings.filter((f) => f.code === 'dangling-ref');
    expect(dangling).toEqual([]);
  });
});

describe('lint — items with no conditions', () => {
  it('is an error, and says the item will not pack', () => {
    const findings = lintLibrary(withItem({ rule: { mode: 'all', conds: [] } as unknown as Rule }));
    const finding = findings.find((f) => f.code === 'no-conditions');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('will not pack');
  });
});

describe('lint — orphans', () => {
  it('flags an item whose last trigger was deleted', () => {
    const findings = lintLibrary(withItem({ orphaned: true }));
    expect(findings.find((f) => f.code === 'orphaned')?.severity).toBe('error');
  });

  it('flags a rule pointing at an activity that no longer exists', () => {
    const findings = lintLibrary(
      withItem({
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'activity', values: ['ghost-activity'] }] },
      }),
    );
    const finding = findings.find((f) => f.code === 'dangling-ref');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('ghost-activity');
  });
});

describe('lint — contradictions', () => {
  it('catches inverted numeric bounds', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'numeric', field: 'nights', op: 'atLeast', value: 5 },
            { kind: 'numeric', field: 'nights', op: 'atMost', value: 3 },
          ],
        },
      }),
    );
    expect(findings.find((f) => f.code === 'contradiction')?.message).toContain('never satisfiable');
  });

  it('catches an exact value outside its own bounds', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'numeric', field: 'people', op: 'exactly', value: 2 },
            { kind: 'numeric', field: 'people', op: 'atLeast', value: 4 },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(true);
  });

  it('catches a set that must both include and exclude the same value', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'set', field: 'activity', values: ['hiking'] },
            { kind: 'set', field: 'activity', values: ['hiking'], not: true },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(true);
  });

  it('catches two disjoint constraints on a single-valued field', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'set', field: 'style', values: ['car-camping'] },
            { kind: 'set', field: 'style', values: ['backcountry'] },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(true);
  });

  it('catches a site question demanded to be both yes and no', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'site', question: 'bearCountry', value: true },
            { kind: 'site', question: 'bearCountry', value: false },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(true);
  });

  it('does not flag an any-mode rule with a false branch — that is just a rule', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'any',
          conds: [
            { kind: 'set', field: 'style', values: ['car-camping'] },
            { kind: 'set', field: 'style', values: ['backcountry'] },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(false);
  });

  it('does not flag disjoint values inside an any-group', () => {
    const findings = lintLibrary(
      withItem({
        rule: {
          mode: 'all',
          conds: [
            {
              kind: 'group',
              mode: 'any',
              conds: [
                { kind: 'set', field: 'style', values: ['car-camping'] },
                { kind: 'set', field: 'style', values: ['backcountry'] },
              ],
            },
          ],
        },
      }),
    );
    expect(findings.some((f) => f.code === 'contradiction')).toBe(false);
  });
});

describe('lint — housekeeping', () => {
  it('warns about duplicates within a category', () => {
    const dupes: Library = {
      ...library,
      items: [
        { ...library.items[0]!, id: 'a', name: 'Tarp', category: 'shelter' },
        { ...library.items[0]!, id: 'b', name: 'tarp', category: 'shelter' },
      ],
    };
    expect(lintLibrary(dupes).some((f) => f.code === 'duplicate')).toBe(true);
  });

  it('warns about gear that packs while marked broken', () => {
    const findings = lintLibrary(withItem({ gear: { condition: 'needs-repair' } }));
    expect(findings.some((f) => f.code === 'retired-gear')).toBe(true);
  });

  it('warns about weightless gear, because the shakedown pass depends on it', () => {
    const findings = lintLibrary(withItem({ weight_g: 0, type: 'gear' }));
    expect(findings.some((f) => f.code === 'no-weight')).toBe(true);
  });

  it('does not ask an action to have a weight', () => {
    const findings = lintLibrary(withItem({ weight_g: 0, type: 'action' }));
    expect(findings.some((f) => f.code === 'no-weight')).toBe(false);
  });
});

describe('export and import', () => {
  it('round-trips a library and its trips without loss', () => {
    const backup = makeBackup(library, [FAMILY_CAR_SUMMER], '2026-08-01T00:00:00Z');
    const restored = parseBackup(serializeBackup(backup));
    expect(restored.data.library.items).toHaveLength(library.items.length);
    expect(restored.data.trips[0]!.id).toBe(FAMILY_CAR_SUMMER.id);
    expect(restored.data.library).toEqual(library);
  });

  it('refuses data from a newer schema rather than silently dropping fields', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version/);
  });

  it('stamps unversioned data as version zero and migrates it forward', () => {
    const result = migrate<{ schemaVersion: number }>({ items: [] });
    expect(result.fromVersion).toBe(0);
    expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects a file that is not JSON, without changing anything', () => {
    expect(() => parseBackup('not json at all')).toThrow(/not valid JSON/);
  });

  it('rejects a JSON file that is not a backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/no library/);
  });

  it('tolerates a backup with no trips array', () => {
    const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION, library });
    expect(parseBackup(json).data.trips).toEqual([]);
  });
});

describe('deterministic ids', () => {
  it('slugifies names predictably', () => {
    expect(slugify('Blue poly tarp (3x4)')).toBe('blue-poly-tarp-3x4');
    expect(slugify('  ')).toBe('x');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
  });

  it('resolves collisions with a counter, so the same import twice is stable', () => {
    const taken = ['item-tarp'];
    expect(uniqueId('item', 'Tarp', taken)).toBe('item-tarp-2');
    expect(uniqueId('item', 'Tarp', [...taken, 'item-tarp-2'])).toBe('item-tarp-3');
    expect(uniqueId('item', 'Tarp', taken)).toBe('item-tarp-2'); // deterministic
  });

  it('counts up for unnamed objects', () => {
    expect(counterId('sh', [])).toBe('sh-1');
    expect(counterId('sh', ['sh-1', 'sh-2'])).toBe('sh-3');
  });
});
