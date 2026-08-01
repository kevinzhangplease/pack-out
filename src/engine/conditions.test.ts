import { describe, expect, it } from 'vitest';
import { evalCondition, evalRule } from './conditions';
import { deriveFacts, nightsBetween } from './facts';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER, NOBODY, ZERO_NIGHTS } from '../data/fixtures';
import type { Cond, Library, Rule, Trip } from '../data/types';

const library: Library = defaultLibrary();
const facts = deriveFacts(FAMILY_CAR_SUMMER, library);

const check = (cond: Cond, t: Trip = FAMILY_CAR_SUMMER) =>
  evalCondition(cond, deriveFacts(t, library)).passed;

describe('nightsBetween', () => {
  it('derives nights from dates and never stores a count', () => {
    expect(nightsBetween('2026-07-10', '2026-07-13')).toBe(3);
  });
  it('is zero for a day trip', () => {
    expect(nightsBetween('2026-07-10', '2026-07-10')).toBe(0);
  });
  it('never goes negative when the dates are backwards', () => {
    expect(nightsBetween('2026-07-13', '2026-07-10')).toBe(0);
  });
  it('is zero for unparseable dates rather than NaN', () => {
    expect(nightsBetween('', 'nonsense')).toBe(0);
  });
});

describe('evalCondition — always', () => {
  it('passes', () => {
    expect(check({ kind: 'always' })).toBe(true);
  });
});

describe('evalCondition — numeric, every field and operator', () => {
  const cases: [Cond, boolean][] = [
    [{ kind: 'numeric', field: 'nights', op: 'atLeast', value: 3 }, true],
    [{ kind: 'numeric', field: 'nights', op: 'atLeast', value: 4 }, false],
    [{ kind: 'numeric', field: 'nights', op: 'atMost', value: 3 }, true],
    [{ kind: 'numeric', field: 'nights', op: 'atMost', value: 2 }, false],
    [{ kind: 'numeric', field: 'nights', op: 'exactly', value: 3 }, true],
    [{ kind: 'numeric', field: 'nights', op: 'exactly', value: 2 }, false],
    [{ kind: 'numeric', field: 'days', op: 'exactly', value: 4 }, true],
    [{ kind: 'numeric', field: 'people', op: 'exactly', value: 4 }, true],
    [{ kind: 'numeric', field: 'driveHours', op: 'atLeast', value: 1.5 }, true],
    [{ kind: 'numeric', field: 'driveHours', op: 'atLeast', value: 2 }, false],
    [{ kind: 'numeric', field: 'overnightLow', op: 'atMost', value: 13 }, true],
    [{ kind: 'numeric', field: 'overnightLow', op: 'atMost', value: 5 }, false],
    [{ kind: 'numeric', field: 'daytimeHigh', op: 'atLeast', value: 24 }, true],
    [{ kind: 'numeric', field: 'daytimeHigh', op: 'atLeast', value: 30 }, false],
    [{ kind: 'numeric', field: 'windKph', op: 'atMost', value: 12 }, true],
    [{ kind: 'numeric', field: 'windKph', op: 'atLeast', value: 20 }, false],
  ];
  it.each(cases)('%o -> %s', (cond, expected) => {
    expect(check(cond)).toBe(expected);
  });

  it('boundaries are inclusive', () => {
    expect(check({ kind: 'numeric', field: 'nights', op: 'atLeast', value: 3 })).toBe(true);
    expect(check({ kind: 'numeric', field: 'nights', op: 'atMost', value: 3 })).toBe(true);
  });

  it('handles negative temperatures without sign confusion', () => {
    const cold = deriveFacts(
      { ...FAMILY_CAR_SUMMER, weather: { ...FAMILY_CAR_SUMMER.weather, overnightLow: -8 } },
      library,
    );
    expect(evalCondition({ kind: 'numeric', field: 'overnightLow', op: 'atMost', value: 0 }, cold).passed).toBe(true);
    expect(evalCondition({ kind: 'numeric', field: 'overnightLow', op: 'atMost', value: -10 }, cold).passed).toBe(false);
  });
});

describe('evalCondition — set fields, both operators', () => {
  it('is any of, single-valued field', () => {
    expect(check({ kind: 'set', field: 'style', values: ['car-camping'] })).toBe(true);
    expect(check({ kind: 'set', field: 'style', values: ['backcountry'] })).toBe(false);
  });

  it('is none of, single-valued field', () => {
    expect(check({ kind: 'set', field: 'style', values: ['backcountry'], not: true })).toBe(true);
    expect(check({ kind: 'set', field: 'style', values: ['car-camping'], not: true })).toBe(false);
  });

  it('derives transport from style rather than storing it', () => {
    expect(check({ kind: 'set', field: 'transport', values: ['vehicle'] })).toBe(true);
    expect(check({ kind: 'set', field: 'transport', values: ['carried'] })).toBe(false);
  });

  it('is any of, multi-valued field, passes on partial overlap', () => {
    expect(check({ kind: 'set', field: 'activity', values: ['hiking', 'climbing'] })).toBe(true);
  });

  it('is none of, multi-valued field, fails on any overlap', () => {
    expect(check({ kind: 'set', field: 'activity', values: ['hiking', 'climbing'], not: true })).toBe(false);
    expect(check({ kind: 'set', field: 'activity', values: ['climbing'], not: true })).toBe(true);
  });

  it('an empty actual set makes "any of" false and "none of" true', () => {
    const noActivities = deriveFacts({ ...FAMILY_CAR_SUMMER, activityIds: [] }, library);
    expect(evalCondition({ kind: 'set', field: 'activity', values: ['hiking'] }, noActivities).passed).toBe(false);
    expect(
      evalCondition({ kind: 'set', field: 'activity', values: ['hiking'], not: true }, noActivities).passed,
    ).toBe(true);
  });

  it('an empty values list never passes in the positive form', () => {
    expect(check({ kind: 'set', field: 'activity', values: [] })).toBe(false);
  });

  it('roles read the whole group when there is no subject', () => {
    expect(check({ kind: 'set', field: 'role', values: ['toddler'] })).toBe(true);
  });

  it('roles narrow to the subject inside a per-person expansion', () => {
    const toddler = library.people.find((p) => p.role === 'toddler')!;
    const adult = library.people.find((p) => p.role === 'adult')!;
    const cond: Cond = { kind: 'set', field: 'role', values: ['toddler'] };
    expect(evalCondition(cond, facts, { subject: toddler }).passed).toBe(true);
    expect(evalCondition(cond, facts, { subject: adult }).passed).toBe(false);
  });

  it('racks gate the gear that needs them', () => {
    expect(check({ kind: 'set', field: 'rack', values: ['roof-rack'] })).toBe(true);
    expect(check({ kind: 'set', field: 'rack', values: ['kayak-rack'] })).toBe(false);
  });
});

describe('evalCondition — site questions, both answers', () => {
  it('reads a yes', () => {
    expect(check({ kind: 'site', question: 'drinkingWater', value: true })).toBe(true);
  });
  it('reads a no — the negative form has to be expressible', () => {
    expect(check({ kind: 'site', question: 'drinkingWater', value: false })).toBe(false);
    expect(check({ kind: 'site', question: 'showers', value: false })).toBe(true);
  });
  it('defaults an unanswered question to no, which is the safe direction', () => {
    expect(check({ kind: 'site', question: 'electricalHookup', value: false })).toBe(true);
    expect(check({ kind: 'site', question: 'electricalHookup', value: true })).toBe(false);
  });
});

describe('evalCondition — one level of grouping', () => {
  it('an any-group passes when one branch passes', () => {
    expect(
      check({
        kind: 'group',
        mode: 'any',
        conds: [
          { kind: 'set', field: 'precip', values: ['rain'] },
          { kind: 'set', field: 'precip', values: ['possible'] },
        ],
      }),
    ).toBe(true);
  });

  it('an all-group fails when one branch fails', () => {
    expect(
      check({
        kind: 'group',
        mode: 'all',
        conds: [
          { kind: 'set', field: 'style', values: ['car-camping'] },
          { kind: 'numeric', field: 'nights', op: 'atLeast', value: 9 },
        ],
      }),
    ).toBe(false);
  });

  it('expresses "hiking AND (rain OR snow)" — the case flat lists cannot', () => {
    const rule: Rule = {
      mode: 'all',
      conds: [
        { kind: 'set', field: 'activity', values: ['hiking'] },
        {
          kind: 'group',
          mode: 'any',
          conds: [
            { kind: 'set', field: 'precip', values: ['rain'] },
            { kind: 'set', field: 'precip', values: ['snow'] },
          ],
        },
      ],
    };
    // Summer fixture hikes, but the forecast is "possible" — so no.
    expect(evalRule(rule, facts).passed).toBe(false);
    const wet = deriveFacts(
      { ...FAMILY_CAR_SUMMER, weather: { ...FAMILY_CAR_SUMMER.weather, precip: 'rain' } },
      library,
    );
    expect(evalRule(rule, wet).passed).toBe(true);
  });

  it('an empty group is false, never vacuously true', () => {
    expect(check({ kind: 'group', mode: 'all', conds: [] })).toBe(false);
    expect(check({ kind: 'group', mode: 'any', conds: [] })).toBe(false);
  });
});

describe('evalRule — the empty-conditions bug, designed out', () => {
  it('a rule with no conditions does not pack, and never means "always"', () => {
    // The type system forbids writing this; imported JSON can still contain it.
    const broken = { mode: 'all', conds: [] } as unknown as Rule;
    expect(evalRule(broken, facts).passed).toBe(false);
  });

  it('an explicit always condition is the only way to say "every trip"', () => {
    expect(evalRule({ mode: 'all', conds: [{ kind: 'always' }] }, facts).passed).toBe(true);
  });
});

describe('evalRule — trace is the return value, not a decoration', () => {
  it('reports which condition failed, in plain English, with the actual value', () => {
    const trace = evalRule(
      {
        mode: 'all',
        conds: [
          { kind: 'set', field: 'style', values: ['car-camping'] },
          { kind: 'numeric', field: 'nights', op: 'atLeast', value: 10 },
        ],
      },
      facts,
    );
    expect(trace.passed).toBe(false);
    expect(trace.conds[0]!.passed).toBe(true);
    expect(trace.conds[1]!.passed).toBe(false);
    expect(trace.conds[1]!.english).toBe('nights is at least 10');
    expect(trace.conds[1]!.actual).toBe('actually 3');
  });

  it('renders a whole rule to a sentence', () => {
    expect(evalRule({ mode: 'all', conds: [{ kind: 'always' }] }, facts).english).toBe(
      'Packs on every trip',
    );
  });
});

describe('degenerate trips', () => {
  it('nobody selected: group facts are empty but nothing throws', () => {
    const f = deriveFacts(NOBODY, library);
    expect(f.people).toBe(0);
    expect(f.eaterUnits).toBe(0);
    expect(evalCondition({ kind: 'set', field: 'role', values: ['adult'] }, f).passed).toBe(false);
  });

  it('zero nights: days collapse to zero rather than going to one', () => {
    const f = deriveFacts(ZERO_NIGHTS, library);
    expect(f.nights).toBe(0);
    expect(f.days).toBe(0);
  });
});
