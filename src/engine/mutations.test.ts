import { describe, expect, it } from 'vitest';
import { deleteActivity, deletePerson, deletionImpact, upsertActivity } from './mutations';
import { infoPanelFor } from './infoPanel';
import { buildList } from './build';
import { lintLibrary } from './lint';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER } from '../data/fixtures';
import type { Item, Library } from '../data/types';

const library = defaultLibrary();

const withItems = (items: Item[]): Library => ({ ...library, items });
const testItem = (overrides: Partial<Item>): Item => ({
  ...library.items[0]!,
  id: 'test-item',
  name: 'Test item',
  ...overrides,
});

describe('deleting a trigger — the bug this replaces', () => {
  it('strips the deleted activity out of rules that also have other conditions', () => {
    const lib = withItems([
      testItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'set', field: 'activity', values: ['hiking', 'climbing'] },
            { kind: 'numeric', field: 'nights', op: 'atLeast', value: 2 },
          ],
        },
      }),
    ]);
    const result = deleteActivity(lib, 'climbing');
    const rule = result.library.items[0]!.rule;
    expect(rule.conds).toHaveLength(2);
    expect(rule.conds[0]).toMatchObject({ values: ['hiking'] });
    expect(result.orphaned).toHaveLength(0);
  });

  it('orphans an item whose ONLY condition was the deleted activity, instead of promoting it', () => {
    const lib = withItems([
      testItem({
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'activity', values: ['climbing'] }] },
      }),
    ]);
    const result = deleteActivity(lib, 'climbing');

    const item = result.library.items[0]!;
    expect(item.orphaned).toBe(true);
    expect(result.orphaned.map((i) => i.id)).toEqual(['test-item']);

    // The critical assertion: it does not silently start packing on every trip.
    const built = buildList(FAMILY_CAR_SUMMER, result.library);
    expect(built.lines.some((l) => l.item.id === 'test-item')).toBe(false);
    expect(built.orphaned.map((i) => i.id)).toEqual(['test-item']);

    // And it is loud about it rather than buried.
    expect(lintLibrary(result.library).some((f) => f.code === 'orphaned')).toBe(true);
  });

  it('keeps the old rule on an orphan so the repair screen can show what it depended on', () => {
    const lib = withItems([
      testItem({
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'activity', values: ['climbing'] }] },
      }),
    ]);
    const item = deleteActivity(lib, 'climbing').library.items[0]!;
    expect(item.rule.conds).toHaveLength(1);
  });

  it('empties a group down to nothing rather than leaving a vacuously-true group', () => {
    const lib = withItems([
      testItem({
        rule: {
          mode: 'all',
          conds: [
            {
              kind: 'group',
              mode: 'any',
              conds: [{ kind: 'set', field: 'activity', values: ['climbing'] }],
            },
          ],
        },
      }),
    ]);
    const result = deleteActivity(lib, 'climbing');
    expect(result.library.items[0]!.orphaned).toBe(true);
  });

  it('keeps a group that still has a surviving branch', () => {
    const lib = withItems([
      testItem({
        rule: {
          mode: 'all',
          conds: [
            {
              kind: 'group',
              mode: 'any',
              conds: [
                { kind: 'set', field: 'activity', values: ['climbing'] },
                { kind: 'set', field: 'activity', values: ['hiking'] },
              ],
            },
          ],
        },
      }),
    ]);
    const result = deleteActivity(lib, 'climbing');
    const group = result.library.items[0]!.rule.conds[0]!;
    expect(group.kind).toBe('group');
    expect(group.kind === 'group' && group.conds).toHaveLength(1);
    expect(result.library.items[0]!.orphaned).toBeFalsy();
  });

  it('removes the activity from the library itself', () => {
    const result = deleteActivity(library, 'climbing');
    expect(result.library.activities.some((a) => a.id === 'climbing')).toBe(false);
  });

  it('leaves items alone that never referenced it', () => {
    const before = JSON.stringify(library.items.find((i) => i.id === 'tent'));
    const result = deleteActivity(library, 'climbing');
    expect(JSON.stringify(result.library.items.find((i) => i.id === 'tent'))).toBe(before);
  });

  it('reports the damage before you commit to it', () => {
    const lib = withItems([
      testItem({
        id: 'a',
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'activity', values: ['hiking'] }] },
      }),
      testItem({
        id: 'b',
        rule: {
          mode: 'all',
          conds: [
            { kind: 'set', field: 'activity', values: ['hiking'] },
            { kind: 'numeric', field: 'nights', op: 'atLeast', value: 1 },
          ],
        },
      }),
    ]);
    expect(deletionImpact(lib, 'activity', 'hiking')).toEqual({ touched: 1, orphaned: 1 });
  });
});

describe('deleting a person', () => {
  it('removes them without touching the default rules, which name no one', () => {
    const result = deletePerson(library, 'p-kid-1');
    expect(result.library.people.some((p) => p.id === 'p-kid-1')).toBe(false);
    expect(result.orphaned).toHaveLength(0);
    expect(result.touched).toHaveLength(0);
  });

  it('still orphans a custom rule that named that person', () => {
    const lib = withItems([
      testItem({
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'person', values: ['p-kid-1'] }] },
      }),
    ]);
    expect(deletePerson(lib, 'p-kid-1').orphaned).toHaveLength(1);
  });
});

describe('adding an activity', () => {
  it('starts with no gear attached, and the panel says so plainly', () => {
    const lib = upsertActivity(library, { id: 'tide-pooling', name: 'Tide pooling' });
    const panel = infoPanelFor({ kind: 'set', field: 'activity' }, lib, new Set());
    expect(panel.groups.some((g) => g.key === 'tide-pooling')).toBe(false);
  });
});

describe('info panels — computed live, never hand-written', () => {
  const packing = new Set(buildList(FAMILY_CAR_SUMMER, library).lines.map((l) => l.item.id));

  it('lists every rule that reads a set field, grouped by value', () => {
    const panel = infoPanelFor({ kind: 'set', field: 'activity' }, library, packing);
    const hiking = panel.groups.find((g) => g.key === 'hiking');
    expect(hiking).toBeDefined();
    expect(hiking!.entries.map((e) => e.item.id)).toContain('hiking-boots');
    expect(hiking!.label).toBe('Hiking');
  });

  it('marks whether each item is currently packing', () => {
    const panel = infoPanelFor({ kind: 'set', field: 'activity' }, library, packing);
    const entries = panel.groups.flatMap((g) => g.entries);
    expect(entries.some((e) => e.packing)).toBe(true);
    expect(entries.some((e) => !e.packing)).toBe(true);
  });

  it('separates "none of" from "any of", because they are different rules', () => {
    const lib = withItems([
      testItem({
        id: 'a',
        rule: { mode: 'all', conds: [{ kind: 'set', field: 'activity', values: ['hiking'] }] },
      }),
      testItem({
        id: 'b',
        rule: {
          mode: 'all',
          conds: [{ kind: 'set', field: 'activity', values: ['hiking'], not: true }],
        },
      }),
    ]);
    const panel = infoPanelFor({ kind: 'set', field: 'activity' }, lib, new Set());
    expect(panel.groups.map((g) => g.key).sort()).toEqual(['hiking', 'none of: hiking']);
  });

  it('groups numeric fields by threshold', () => {
    const panel = infoPanelFor({ kind: 'numeric', field: 'overnightLow' }, library, packing);
    expect(panel.groups.some((g) => g.label.startsWith('≤'))).toBe(true);
    expect(panel.itemCount).toBeGreaterThan(0);
  });

  it('groups a site question by answer, so both answers are visible', () => {
    const panel = infoPanelFor({ kind: 'site', question: 'drinkingWater' }, library, packing);
    expect(panel.groups.map((g) => g.key).sort()).toEqual(['no']);
    expect(panel.groups[0]!.label).toBe('Answered no');
  });

  it('reports an empty panel rather than pretending, when nothing reads the field', () => {
    const panel = infoPanelFor({ kind: 'site', question: 'electricalHookup' }, library, packing);
    expect(panel.groups).toEqual([]);
    expect(panel.itemCount).toBe(0);
  });

  it('counts an item once even when two of its conditions read the same value', () => {
    const lib = withItems([
      testItem({
        rule: {
          mode: 'all',
          conds: [
            { kind: 'set', field: 'activity', values: ['hiking'] },
            { kind: 'set', field: 'activity', values: ['hiking'] },
          ],
        },
      }),
    ]);
    const panel = infoPanelFor({ kind: 'set', field: 'activity' }, lib, new Set());
    expect(panel.groups[0]!.entries).toHaveLength(1);
  });
});

describe('info panels — sections that drive quantities, not conditions', () => {
  it('reports what counts from the sleeping arrangement', () => {
    const packing = new Set(buildList(FAMILY_CAR_SUMMER, library).lines.map((l) => l.item.id));
    const panel = infoPanelFor({ kind: 'qtyUnit', unit: 'perShelter' }, library, packing);
    const ids = panel.groups.flatMap((g) => g.entries.map((e) => e.item.id));
    expect(ids).toContain('tent');
    expect(ids).toContain('lantern');
    expect(panel.groups[0]!.entries[0]!.because).toMatch(/per shelter/);
  });

  it('does not claim a dependency where the rate is zero', () => {
    const panel = infoPanelFor({ kind: 'qtyUnit', unit: 'flat' }, library, new Set());
    expect(panel.groups).toEqual([]);
  });
});
