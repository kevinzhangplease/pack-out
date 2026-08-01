import { describe, expect, it } from 'vitest';
import {
  addMissing,
  dismissProposal,
  proposalsFrom,
  reviewCandidates,
  reviewProgress,
  setOutcome,
  undismissAll,
} from './review';
import { buildList } from './build';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER } from '../data/fixtures';
import { migrate, SCHEMA_VERSION } from '../data/schema';
import type { Library, ReviewOutcome, Trip } from '../data/types';

const library = defaultLibrary();

/** A reviewed trip: same shape as the fixture, different weather and verdict. */
const reviewed = (
  name: string,
  daytimeHigh: number,
  entries: { itemId: string; outcome: ReviewOutcome }[],
): Trip => ({
  ...FAMILY_CAR_SUMMER,
  id: `trip-${name}`,
  name,
  weather: { ...FAMILY_CAR_SUMMER.weather, daytimeHigh },
  review: { completedISO: '2026-07-14T00:00:00Z', entries },
});

describe('proposals need evidence before they say anything', () => {
  it('proposes nothing from an empty history', () => {
    expect(proposalsFrom(library, [])).toEqual([]);
  });

  it('ignores a review that has not been completed', () => {
    const draft: Trip = {
      ...FAMILY_CAR_SUMMER,
      review: {
        entries: [
          { itemId: 'screen-shelter', outcome: 'unused' },
          { itemId: 'screen-shelter', outcome: 'unused' },
        ],
      },
    };
    expect(proposalsFrom(library, [draft, draft])).toEqual([]);
  });

  it('does not act on a single unused report', () => {
    const trips = [reviewed('One', 24, [{ itemId: 'screen-shelter', outcome: 'unused' }])];
    expect(proposalsFrom(library, trips).some((p) => p.itemId === 'screen-shelter')).toBe(false);
  });
});

describe('the screen shelter case from the brief', () => {
  // "the screen shelter went unused on both summer trips; raise its
  // temperature threshold?" — the rule is daytimeHigh at least 22.
  const trips = [
    reviewed('July at Porteau', 24, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
    reviewed('August at Alice Lake', 26, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
  ];

  it('proposes raising the threshold past both trips', () => {
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'screen-shelter')!;
    expect(proposal.kind).toBe('tighten-threshold');
    expect(proposal.title).toContain('Raise the threshold');
  });

  it('names the evidence rather than gesturing at it', () => {
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'screen-shelter')!;
    expect(proposal.rationale).toContain('July at Porteau');
    expect(proposal.rationale).toContain('August at Alice Lake');
    expect(proposal.rationale).toContain('24, 26');
  });

  it('shows the rule before and after, in plain English', () => {
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'screen-shelter')!;
    expect(proposal.before).toContain('at least 22');
    expect(proposal.after).toContain('at least 27');
  });

  it('applies as a real library edit that changes the list', () => {
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'screen-shelter')!;
    const before = buildList(trips[0]!, library);
    const after = buildList(trips[0]!, proposal.apply!(library));
    expect(before.lines.some((l) => l.item.id === 'screen-shelter')).toBe(true);
    expect(after.lines.some((l) => l.item.id === 'screen-shelter')).toBe(false);
  });

  it('stops proposing once the edit is applied', () => {
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'screen-shelter')!;
    const edited = proposal.apply!(library);
    expect(proposalsFrom(edited, trips).some((p) => p.kind === 'tighten-threshold')).toBe(false);
  });

  it('says nothing when the item was actually used once', () => {
    const mixed = [
      trips[0]!,
      reviewed('August', 26, [{ itemId: 'screen-shelter', outcome: 'used' }]),
    ];
    expect(proposalsFrom(library, mixed).some((p) => p.itemId === 'screen-shelter')).toBe(false);
  });
});

describe('at-most thresholds move the other way', () => {
  const trips = [
    reviewed('Mild one', 20, [{ itemId: 'insulating-layer', outcome: 'unused' }]),
    reviewed('Mild two', 20, [{ itemId: 'insulating-layer', outcome: 'unused' }]),
  ].map((t, i) => ({
    ...t,
    weather: { ...t.weather, overnightLow: [11, 10][i]! },
  }));

  it('lowers an at-most threshold below every unused trip', () => {
    // Rule is overnightLow at most 12; unused at 11 and 10.
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'insulating-layer')!;
    expect(proposal.after).toContain('at most 9');
  });
});

describe('wanted it and did not have it', () => {
  it('loosens a threshold to include the trip where it was missed', () => {
    const trips = [
      reviewed('Cold snap', 24, [{ itemId: 'screen-shelter', outcome: 'missing' }]),
    ];
    const proposal = proposalsFrom(library, trips).find((p) => p.kind === 'loosen-threshold')!;
    expect(proposal.after).toContain('at least 24');
    expect(proposal.rationale).toContain('would have packed it');
  });

  it('acts on a single report, because missing something matters more than carrying it', () => {
    const trips = [reviewed('Once', 24, [{ itemId: 'screen-shelter', outcome: 'missing' }])];
    expect(proposalsFrom(library, trips).some((p) => p.kind === 'loosen-threshold')).toBe(true);
  });

  it('is advisory when the rule has no threshold to loosen', () => {
    const trips = [reviewed('Once', 24, [{ itemId: 'paper-map', outcome: 'missing' }])];
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'paper-map')!;
    expect(proposal.apply).toBeNull();
    expect(proposal.rationale).toContain('no threshold to loosen');
  });
});

describe('things that are not in the library at all', () => {
  it('reports them by name and refuses to invent a rule', () => {
    const trip: Trip = {
      ...FAMILY_CAR_SUMMER,
      name: 'The one with the wasps',
      review: {
        completedISO: '2026-08-01T00:00:00Z',
        entries: [{ missingName: 'Wasp trap', outcome: 'missing' }],
      },
    };
    const proposal = proposalsFrom(library, [trip]).find((p) => p.kind === 'add-missing-item')!;
    expect(proposal.title).toContain('Wasp trap');
    expect(proposal.rationale).toContain('The one with the wasps');
    expect(proposal.apply).toBeNull();
  });

  it('groups the same missing thing across trips', () => {
    const one: Trip = {
      ...FAMILY_CAR_SUMMER,
      id: 'a',
      name: 'Trip A',
      review: { completedISO: 'x', entries: [{ missingName: 'Wasp trap', outcome: 'missing' }] },
    };
    const two: Trip = { ...one, id: 'b', name: 'Trip B' };
    const proposals = proposalsFrom(library, [one, two]).filter(
      (p) => p.kind === 'add-missing-item',
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.rationale).toContain('Trip A, Trip B');
  });
});

describe('broken gear', () => {
  it('proposes marking it, and says what marking it will do', () => {
    const trips = [reviewed('The windy one', 24, [{ itemId: 'tent', outcome: 'broke' }])];
    const proposal = proposalsFrom(library, trips).find((p) => p.kind === 'mark-needs-repair')!;
    expect(proposal.itemId).toBe('tent');
    expect(proposal.rationale).toContain('It still packs');
  });

  it('applies to the gear state, and the linter then notices', () => {
    const trips = [reviewed('The windy one', 24, [{ itemId: 'tent', outcome: 'broke' }])];
    const proposal = proposalsFrom(library, trips).find((p) => p.kind === 'mark-needs-repair')!;
    const edited = proposal.apply!(library);
    expect(edited.items.find((i) => i.id === 'tent')!.gear?.condition).toBe('needs-repair');
  });

  it('does not nag about gear already marked', () => {
    const marked: Library = {
      ...library,
      items: library.items.map((i) =>
        i.id === 'tent' ? { ...i, gear: { ...i.gear, condition: 'needs-repair' as const } } : i,
      ),
    };
    const trips = [reviewed('The windy one', 24, [{ itemId: 'tent', outcome: 'broke' }])];
    expect(proposalsFrom(marked, trips).some((p) => p.kind === 'mark-needs-repair')).toBe(false);
  });
});

describe('quantities', () => {
  it('proposes a quarter less after two trips with too much', () => {
    const trips = [
      reviewed('A', 24, [{ itemId: 'propane-canister', outcome: 'too-much' }]),
      reviewed('B', 24, [{ itemId: 'propane-canister', outcome: 'too-much' }]),
    ];
    const proposal = proposalsFrom(library, trips).find((p) => p.kind === 'reduce-quantity')!;
    expect(proposal.before).toContain('0.5');
    expect(proposal.after).toContain('0.38');
  });

  it('proposes more after a single run-out, because running out is worse', () => {
    const trips = [reviewed('A', 24, [{ itemId: 'propane-canister', outcome: 'not-enough' }])];
    const proposal = proposalsFrom(library, trips).find((p) => p.kind === 'increase-quantity')!;
    expect(proposal.rationale).toContain('Running out');
    const edited = proposal.apply!(library);
    expect(edited.items.find((i) => i.id === 'propane-canister')!.qty.rate).toBeGreaterThan(0.5);
  });

  it('bumps the base for a flat item that ran out', () => {
    const trips = [reviewed('A', 24, [{ itemId: 'lighter', outcome: 'not-enough' }])];
    const proposal = proposalsFrom(library, trips).find((p) => p.itemId === 'lighter')!;
    const edited = proposal.apply!(library);
    expect(edited.items.find((i) => i.id === 'lighter')!.qty.base).toBe(3);
  });
});

describe('dismissal', () => {
  const trips = [
    reviewed('A', 24, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
    reviewed('B', 26, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
  ];

  it('a dismissed proposal stops coming back', () => {
    const proposal = proposalsFrom(library, trips)[0]!;
    const dismissed = dismissProposal(library, proposal.id);
    expect(proposalsFrom(dismissed, trips).some((p) => p.id === proposal.id)).toBe(false);
  });

  it('can be undone in bulk', () => {
    const proposal = proposalsFrom(library, trips)[0]!;
    const restored = undismissAll(dismissProposal(library, proposal.id));
    expect(proposalsFrom(restored, trips).some((p) => p.id === proposal.id)).toBe(true);
  });

  it('has a stable id across runs, so dismissal sticks', () => {
    const first = proposalsFrom(library, trips).map((p) => p.id);
    const second = proposalsFrom(library, trips).map((p) => p.id);
    expect(first).toEqual(second);
  });
});

describe('capturing the review', () => {
  it('asks about what actually packed, not the whole library', () => {
    const candidates = reviewCandidates(FAMILY_CAR_SUMMER, library);
    expect(candidates.length).toBeGreaterThan(20);
    expect(candidates.length).toBeLessThan(library.items.length);
    expect(candidates.some((c) => c.itemId === 'stove-backpacking')).toBe(false);
  });

  it('does not ask about tasks or individual ingredients', () => {
    const candidates = reviewCandidates(FAMILY_CAR_SUMMER, library);
    expect(candidates.some((c) => c.itemId.startsWith('act-'))).toBe(false);
    expect(candidates.some((c) => c.itemId.startsWith('ingredient:'))).toBe(false);
  });

  it('asks once about an item issued to four people', () => {
    const candidates = reviewCandidates(FAMILY_CAR_SUMMER, library);
    expect(candidates.filter((c) => c.itemId === 'sleeping-bag')).toHaveLength(1);
  });

  it('records and clears an outcome', () => {
    const withOutcome = setOutcome(FAMILY_CAR_SUMMER, 'tent', 'used');
    expect(withOutcome.review.entries).toHaveLength(1);
    expect(setOutcome(withOutcome, 'tent', null).review.entries).toHaveLength(0);
  });

  it('replaces rather than duplicating when you change your mind', () => {
    const once = setOutcome(FAMILY_CAR_SUMMER, 'tent', 'used');
    const twice = setOutcome(once, 'tent', 'broke');
    expect(twice.review.entries).toHaveLength(1);
    expect(twice.review.entries[0]!.outcome).toBe('broke');
  });

  it('records something that was not in the library', () => {
    const withMissing = addMissing(FAMILY_CAR_SUMMER, '  Wasp trap  ');
    expect(withMissing.review.entries[0]!.missingName).toBe('Wasp trap');
  });

  it('ignores an empty missing entry', () => {
    expect(addMissing(FAMILY_CAR_SUMMER, '   ').review.entries).toHaveLength(0);
  });

  it('reports progress through the review', () => {
    const candidates = reviewCandidates(FAMILY_CAR_SUMMER, library);
    const trip = setOutcome(FAMILY_CAR_SUMMER, candidates[0]!.itemId, 'used');
    const progress = reviewProgress(reviewCandidates(trip, library), trip);
    expect(progress.answered).toBe(1);
    expect(progress.complete).toBe(false);
  });
});

describe('schema migration v4 to v5', () => {
  it('gives old trips an empty review and the library an empty dismissal list', () => {
    const old = {
      schemaVersion: 4,
      library: {
        items: [],
        containers: [],
        activities: [],
        people: [],
        vehicles: [],
        meals: [],
        pantry: {},
      },
      trips: [{ id: 't1', name: 'Old' }],
    };
    const result = migrate<{ schemaVersion: number; library: Library; trips: Trip[] }>(old);
    expect(result.data.trips[0]!.review.entries).toEqual([]);
    expect(result.data.library.dismissedProposals).toEqual([]);
    expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('carries a v1 backup through every migration in order', () => {
    const ancient = {
      schemaVersion: 1,
      library: { items: [], containers: [], activities: [], people: [], vehicles: [] },
      trips: [{ id: 't1', name: 'Ancient' }],
    };
    const result = migrate<{ schemaVersion: number; library: Library; trips: Trip[] }>(ancient);
    expect(result.applied).toHaveLength(4);
    expect(result.data.trips[0]!.mealPlan).toEqual([]);
    expect(result.data.trips[0]!.packedBy).toEqual({});
    expect(result.data.trips[0]!.jurisdiction).toBe('unknown');
    expect(result.data.trips[0]!.review.entries).toEqual([]);
  });
});

describe('a new trip must not inherit a review', () => {
  it('two trips sharing one completed review would fabricate evidence', () => {
    // This is the shape of the bug: a duplicated trip carrying the previous
    // trip's completed review gives the loop two "independent" observations of
    // the same event, which is enough to trip the two-reports threshold.
    const one = reviewed('Real trip', 24, [{ itemId: 'screen-shelter', outcome: 'unused' }]);
    const copied: Trip = { ...one, id: 'copy', name: 'Copied trip' };

    const fabricated = proposalsFrom(library, [one, copied]);
    expect(fabricated.some((p) => p.kind === 'tighten-threshold')).toBe(true);

    // With the review reset, as the app now does, there is only one report and
    // the loop correctly stays quiet.
    const reset: Trip = { ...copied, review: { entries: [] } };
    expect(proposalsFrom(library, [one, reset]).some((p) => p.kind === 'tighten-threshold')).toBe(
      false,
    );
  });
});

describe('the loop stops once you have acted', () => {
  const trips = [
    reviewed('A', 24, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
    reviewed('B', 26, [{ itemId: 'screen-shelter', outcome: 'unused' }]),
  ];

  it('says nothing at all about an item whose threshold is already past the evidence', () => {
    const edited = proposalsFrom(library, trips)[0]!.apply!(library);
    // Not merely no tighten proposal — no proposal of any kind. Re-raising the
    // same evidence as an advisory would be nagging about a settled decision.
    expect(proposalsFrom(edited, trips).filter((p) => p.itemId === 'screen-shelter')).toEqual([]);
  });
});
