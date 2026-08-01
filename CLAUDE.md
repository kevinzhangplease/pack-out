# Working on Pack Out

## Workflow

**Commit and push directly to `main`.** No feature branches, no pull requests
unless asked. `main` is deployed to Vercel automatically on push.

Before every push:

```sh
npm run check    # typecheck + 360 tests + stylesheet audit — all three must pass
```

Verify UI changes in a browser before claiming they work. There is a Chromium at
`/opt/pw-browsers/chromium` and Playwright is configured to find it; render the
page, click the thing, and read the console. Several real bugs in this codebase
were found that way and would not have been found any other way.

## The rules that hold this together

These are not style preferences. Each one exists because of a specific failure,
recorded in `docs/decisions.md`.

1. **A rule can never have zero conditions.** `Rule.conds` is a non-empty tuple.
   Empty never means "always true" — that is what silently packed everything on
   every trip in the version this replaces. "Always" is an explicit condition.

2. **Evaluation returns a trace; the boolean is derived from it.** Never add a
   second path that computes whether an item packs. The explanation and the
   decision must be the same computation or they will drift.

3. **Nothing removes an item from the list except a rule.** Not gear condition,
   not pantry stock, not anything inventory-shaped. Stale beliefs are how you
   arrive with no salt. Left-behind and household-covered items are the two
   exceptions, and both are shown struck through rather than made absent.

4. **Every selector in a stylesheet is class-based or wrapped in `:where()`.**
   `scripts/audit-css.mjs` fails the build otherwise. It has caught this in our
   own code three times.

5. **The three scopes stay separate.** Library is durable, Trip is per-trip,
   Session is per-trip and resettable. When adding a field, ask which lifetime it
   has — `coveredBy` was put on the library in phase 1 and had to be moved in
   phase 5 for exactly this reason.

6. **The app says what it cannot know.** Safety gates, jurisdiction prompts and
   seasonal hazards name the thing the app has not checked and point at who has.
   A confident-looking list implying a check nobody made is the failure mode
   worth designing against.

## Schema changes

Bump `SCHEMA_VERSION` in `src/data/schema.ts`, append one migration with
`to` equal to the new version, and never edit or reorder an existing one. There
is a test asserting a v1 backup still migrates all the way forward.

## Layout

The engine (`src/engine/`) is pure functions over plain data with no React in
it. That is what makes it testable, and the tests are why the library can be
edited without fear. Keep it that way — if a view needs something computed, the
computation goes in the engine and the view reads it.
