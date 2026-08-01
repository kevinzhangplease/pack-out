# Pack Out

A transparent, editable rules engine for camping, with a packing app on top of it.

**Live: https://pack-out.vercel.app** — deployed from `main` on every push.

The list is generated, never hand-maintained. Every item can say why it is there,
every reason is a rule in plain language, and every rule is data you can edit
rather than code somebody shipped. It is built the way a zoning bylaw is built:
codified conditions, exemptions and thresholds, with an interpretation trail from
input to outcome.

If a packing decision is hard-coded anywhere in here, that is a bug.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + stylesheet audit
npm run build      # static output in dist/, deployable to Vercel as-is
```

## How it fits together

```
Trip (inputs) ──► deriveFacts ──► buildList ──► grouped views
                                      ▲
                            Library (items, rules, people, containers)
```

| Directory | What lives there |
|---|---|
| `src/data/` | Types, the default library, the authoring DSL, schema and migrations, golden fixtures |
| `src/engine/` | Pure functions over plain data: facts, condition and quantity evaluation, list building, lint, diff, gates, meals, load plan, judgement, the review loop, text export |
| `src/state/` | Three storage scopes, kept separate: library, trips, session |
| `src/views/` | One per navigation destination |
| `src/components/` | Shared pieces, including the interpretation trail |
| `scripts/` | The stylesheet audit that runs in `npm run check` |
| `docs/decisions.md` | Why things are the way they are |

The engine is pure and has no React in it. That is what makes it testable, and
the tests are the reason the library can be edited without fear.

## Three lifetimes, three scopes

| Scope | Contains | Lifetime |
|---|---|---|
| Library | items, rules, containers, activities, people, meals, pantry stock | durable; the valuable thing |
| Trip | dates, conditions, who, site answers, sleeping arrangement, meal plan | one per trip, many saved |
| Session | checkboxes, collapsed groups | per trip, resettable |

Session state is keyed by trip id, so checks cannot bleed between trips.

## Two bugs designed out from the start

**An empty condition list never means "always true."** `Rule.conds` is a
non-empty tuple, so it cannot be written. Items that lose their last trigger are
marked orphaned, excluded from every list, and surfaced rather than silently
promoted. See ADR-001.

**Global resets cannot outrank component styles.** Every selector in the reset is
wrapped in `:where()` so it contributes zero specificity, and
`scripts/audit-css.mjs` fails the build if a type selector escapes one. The same
script checks WCAG AA contrast for every declared colour pair across all three
themes. See ADR-005.

## Testing

```sh
npm test
```

Covers `evalCondition` across every field type, both operators and negation;
`evalQuantity` across every unit, the cap, rounding and float noise; `buildList`
against golden fixtures — family car camping in summer, solo backcountry in
shoulder season, winter hike-in, kayak — plus the degenerate cases: nobody
selected, zero nights, empty library, and an item whose conditions were stripped.
The library lint pass runs in tests and in the UI. 360 tests in all, covering
the food engine, the load plan and shakedown, the judgement prompts, the five
schema migrations, and the review loop — including a regression test for a
duplicated trip fabricating evidence for the learning loop.

## Build order

- **Phase 1 — engine and skeleton.** *Done.* Types, condition and quantity
  evaluation, the default library, list generation, grouping by container /
  category / person / phase, safety gates, the lint pass, export and import,
  offline shell.
- **Phase 2 — the trip.** *Done.* Dates, location, weather with
  fetch-as-proposal, people, activities, the site questionnaire, sleeping
  arrangement, info panels on every section, saved trips.
- **Phase 3 — food.** *Done.* Per-day meal plan against real dates with
  copy-a-day and leftover linking, the three output categories on the packing
  list, shopping list by store section with pantry stock, generated prep tasks
  on the timeline, cooler loading order, cold chain, complexity budget and
  weather contingency.
- **Phase 4 — packing reality.** *Done.* The top-down load plan with tappable
  zones for vehicle, pack and kayak; per-zone weights and loading notes;
  responsibility assignment as a fifth grouping axis; the shakedown pass with
  the 20%-of-body-weight flag and leave-behind; the kid-facing list.
- **Phase 5 — judgement.** *Done.* Generated trip plan document with a
  completeness check, jurisdiction prompts, seasonal hazards keyed to the dates,
  camp job assignment with clash detection, multi-household gear splitting,
  editable gear condition, per-person medical details.
- **Phase 6 — the loop.** *Done.* Post-trip review capture, and proposals
  computed across every completed review: tighten or loosen a threshold, mark
  gear for repair, adjust a quantity. Each names the trips it came from and
  shows the rule change as a plain-English diff you accept or dismiss. Plus the
  condition builder, so every rule is editable in the UI.

## Working on it

Commit straight to `main`; Vercel deploys on push. Run `npm run check` first —
typecheck, tests and the stylesheet audit all have to pass. See `CLAUDE.md` for
the invariants that hold the design together, and `docs/decisions.md` for why
each one exists.

## Accessibility and physical context

Used one-handed, at the back of a van, in the rain, in the dark, with cold hands.
Minimum 44px touch targets (verified in a browser, not by eye), real checkbox
semantics rather than buttons with `aria-pressed`, day / night / red-light
themes, WCAG AA verified by script, reduced motion respected.
