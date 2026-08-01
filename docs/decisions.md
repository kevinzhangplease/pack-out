# Decisions

Short records of the choices that shaped the code, kept next to it so the
reasoning survives the conversation it came from.

---

## ADR-001 — An empty condition list is unrepresentable

**Context.** In an earlier version, deleting an activity stripped it from every
rule that referenced it. Any item that depended only on that activity ended up
with zero conditions, and the evaluator read "no conditions failed" as "all
conditions passed" — so the item silently promoted itself onto every trip.

**Decision.** `Rule.conds` is a non-empty tuple type, `[Cond, ...Cond[]]`. There
is no way to write an empty condition list in TypeScript. "This always packs" is
an explicit `{ kind: 'always' }` condition, which reads as *"Packs on every
trip"* and is visible in the library.

Because imported JSON can still contain an empty array, `evalRule` also treats
zero conditions as **false**, and `buildList` routes such items to an `orphaned`
bucket that is excluded from every list and surfaced in the UI and the linter.
Vacuous never means true anywhere in the engine — the same rule applies to empty
`GroupCond`s.

**Consequence.** The failure mode changed from "silent wrong list" to "loud
broken item". A rule that loses its last trigger now shows up as an error in the
library health panel and in a quarantine section on the list.

---

## ADR-002 — Evaluation returns a trace; the boolean is derived

**Context.** The brief asks that every item be able to say why it is there, that
the reason be readable, and that the trip screen show which rules read each
input. Bolting explanation onto a boolean evaluator means maintaining two
descriptions of the same logic, which drift.

**Decision.** `evalRule` returns a `RuleTrace`: every condition, whether it
passed, its rendering in English, and what the trip actually said. `passed` is
computed from that structure. `buildList` attaches the trace to each line.

**Consequence.** The "why" disclosure, the info panels, the diff and the text
export all read one structure, so an explanation cannot disagree with the
decision it describes. Cost: a build allocates a trace per item, which is
irrelevant at library sizes of a few hundred.

---

## ADR-003 — Gear state annotates; it never suppresses

**Context.** The brief wants the library to know gear condition and stock, and
wants pantry staples tracked by stock rather than presence.

**Decision.** `GearState` can annotate a row, warn in the lint pass, raise a
gate, and feed the shopping list. It can **never** remove an item from the
packing list.

**Rationale.** Inventory state goes stale silently. A belief that there is salt
in the pantry box is a belief, and if a stale belief can delete salt from the
list you find out at camp. Absence of an item must always trace to a rule.

---

## ADR-004 — Safety gates qualify the list; they do not withhold it

**Context.** The brief says the app should "refuse to produce a confident list"
for a genuinely dangerous combination, such as below freezing plus a hike-in
trip.

**Decision.** A blocking gate forces the relevant kit into the list, removes the
affordances that make a list look complete (progress count, green states), and
states plainly what the app cannot assess, with a pointer to the real source.
It does not withhold the list.

**Rationale, and the disagreement.** This is a deliberate departure from a
literal reading. A withheld list at 9pm the night before does not produce a
safer trip; it produces a trip packed from memory. The honest failure mode is a
list that visibly refuses to call itself finished, not an absent one. The word
"confident" is the part worth honouring.

---

## ADR-005 — Global resets are wrapped in `:where()`, enforced by script

**Context.** A shared reset of the form `.app button { color: inherit }` has
specificity 0,1,1 and outranks every single-class component rule written against
it. The symptom was invisible navigation tabs, with no error anywhere.

**Decision.** Every selector in `src/styles/reset.css` is wrapped in `:where()`,
so it contributes zero specificity. `scripts/audit-css.mjs` fails the build if a
type selector appears outside a `:where()` in any stylesheet, and checks every
declared foreground/background pair against WCAG AA in all three themes.

**Consequence.** The audit has already caught this pattern in this codebase
once — `.row__check input` at 0,1,1 — which is the argument for having it.

---

## ADR-006 — Navigation is hybrid: workflow plus library

**Context.** Open decision 1: organise by data (Trip / Meals / List / Gear) or by
workflow (Plan → Shop → Prep → Load → Go → Review).

**Decision.** Workflow for trip work; Library and Data as separate top-level
destinations.

**Rationale.** A pure workflow nav has nowhere honest to put the library. The
library has a different lifetime from any trip — it is edited between trips, not
during one — and filing rule editing under "Plan" would misrepresent what it is.
Data (export/import) sits outside for the same reason.

---

## ADR-007 — One level of condition nesting

**Context.** Open decision 5. Flat AND-lists cannot express
"hiking AND (rain OR snow)".

**Decision.** A rule's condition list holds leaves or single-level groups.
`GroupCond.conds` is `LeafCond[]`, so a group cannot contain a group.

**Rationale.** One level covers nearly every real case. It renders to English
without parenthesis soup, and the editor can show a group as one indented chip
row. Arbitrary nesting is where rule libraries become unreadable, and it is the
part that is genuinely unpleasant on a phone.

---

## ADR-008 — Weather is fetched on request and applied as a proposal

**Context.** Open decision 4.

**Decision.** No automatic prefill. A fetch is an explicit action whose result is
shown as a diff against the current conditions, which the user accepts or
rejects.

**Rationale.** Silent prefill mutates rule inputs without the user noticing,
which destroys the mental model the app exists to build, and it degrades badly
in exactly the places this app is used. (Implementation lands in phase 2.)

---

## ADR-009 — Multi-household: schema now, interface later

**Context.** Open decision 3.

**Decision.** `Item.ownership` and `Item.coveredBy` exist from the first commit;
the interface for splitting group gear with another family arrives in phase 5.

**Rationale.** The fields cost almost nothing now. Retrofitting them later would
touch every view that renders a line.

---

## ADR-010 — Meals contribute to the packing list without becoming rules

**Context.** Every meal contributes three things to the list: cooking
instruments, eating instruments, and ingredients. The first two are library
items; the third is not, and a meal can require an item that no rule would have
packed (foil on a hike-in trip, say).

**Decision.** `buildList` takes an optional `MealContribution`. A required item
whose rule fails is still packed, and ingredients are synthesised into list
lines. Both carry a `RuleTrace` of the same shape as a rule-driven line, whose
conditions are the meals that need them.

**Rationale.** The alternative was a condition field like `usedByMealPlan`,
which would have made the rule language know about food — a much larger
commitment for no gain. Keeping the trace shape identical means the "why"
disclosure, the diff, the text export and the grouping all work on meal lines
with no special cases, so a row that arrived via the meal plan can still answer
"why is this here" in exactly the same way.

**Consequence.** `MealContribution` is declared in `engine/build.ts` rather than
imported from `engine/meals.ts`, so the core builder keeps no dependency on
food.

---

## ADR-011 — Pantry stock strikes items through; it never hides them

**Context.** Salt and oil should not appear on the shopping list every trip
(§6), which argues for hiding staples believed to be in stock.

**Decision.** In-stock staples stay on the shopping list, struck through, with a
"Ran out" button. They are excluded from the count of things to buy and from the
text export's main body, where they appear under a separate heading.

**Rationale.** Stock is a belief, and beliefs go stale. Hiding an item because
of a stale belief is how you arrive with no salt. Striking it through gives you
the benefit — it is visibly not something to buy — while keeping it visible
enough to correct in one tap. This is ADR-003 applied to food.

---

## ADR-012 — The meal plan and the shopping list share a screen

**Context.** Open question implied by §9.1: where does food live in a
workflow-shaped navigation?

**Decision.** One "Food" step holds the meal plan and the shopping list. The
prep-at-home tasks it generates live on "Prep", alongside the rule-driven
timeline actions.

**Rationale.** Planning meals and generating the shopping list are one sitting:
the list falls out of the plan and you check it against the plan. Prep is a
different moment — a different day, in fact — so it belongs with the other
things that happen at T-3 days and the night before. The workflow step formerly
labelled "Shop" is labelled "Food" for this reason; the shopping list is its
output, not its whole subject.

---

## ADR-013 — Load zones are footprint zones, so they can be drawn

**Context.** The signature element is a top-down load plan with tappable zones.
An earlier zone list had "rear floor" and "rear top", which is a vertical
stack — and a top-down plan cannot show stacking.

**Decision.** Vehicle zones are spatial footprints: roof, cabin front, cabin
second row, boot forward, boot at the tailgate, under the floor, hitch. The
heavy-low-forward guidance moved into the zone's note rather than into its name.

**Rationale.** A diagram that lies about geometry is worse than a list. Making
the zones match what can actually be drawn keeps the plan honest, and the note
carries the loading principle better than a zone name could.

Packs and kayaks get their own vocabularies, and the plan is switchable by
transport rather than fixed by trip style — you drive to a trailhead, so the
same list gets loaded twice in one day.

---

## ADR-014 — Pack zones come from what a thing is; vehicle zones from its bin

**Context.** Containers are the right unit for a vehicle: you carry a bin. They
are the wrong unit for a pack, where a sleeping bag and a stove are in the same
"personal pack" but belong at opposite ends of it.

**Decision.** For a vehicle or a boat, the zone comes from the container. For a
pack, resolution is: explicit `Item.packZone`, then the container's carried
zone, then a default from the item's category.

**Consequence.** A container with no zone for a given transport yields `null`
and lands in a visible "no place assigned" bucket rather than being silently
guessed at.

---

## ADR-015 — Left behind is shown, not deleted

**Context.** The shakedown pass needs a way to drop things from a trip.

**Decision.** Left-behind items come off the packing list but appear in their
own struck-through section on the load plan, with a one-tap "Bring it".

**Rationale.** Same principle as ADR-003 and ADR-011: a decision is not the same
as an absence. If dropping the screen shelter looked identical to the screen
shelter never having qualified, you would lose the ability to reconsider it —
and the post-trip review would have nothing to learn from.

---

## ADR-016 — The shakedown follows the transport you are looking at

**Context.** The load plan is switchable, but the shakedown initially keyed off
the trip's own transport, so switching to the pack view on a car-camping trip
showed a plan with no weight check.

**Decision.** `shakedown` takes the transport being viewed, defaulting to the
trip's own.

**Rationale.** Found in browser verification. The switch exists precisely
because you drive to a trailhead — and the moment you are looking at the pack is
exactly the moment the weight question matters.

---

## ADR-017 — `coveredBy` belongs to the trip, not the library

**Context.** `Item.coveredBy` was added to the library in phase 1 as cheap
groundwork for multi-household support (ADR-009). Building the feature showed
the placement was wrong.

**Decision.** Coverage moved to `Trip.coveredBy`, a map from item id to
household id, alongside `Trip.households`. The library field is deleted by the
v4 migration.

**Rationale.** Who brings the stove is a fact about one weekend. Putting it on
the item made it durable, so a decision made for one trip with one family would
silently apply to every subsequent trip — the exact class of bug the three-scope
separation exists to prevent. The original ADR was right that the field costs
little; it was wrong about which scope it belonged in.

---

## ADR-018 — Coverage and left-behind items are shown, never silently absent

**Context.** Three features now remove things from the packing list: leaving
gear behind after a shakedown, another household bringing it, and (rejected)
inventory state.

**Decision.** The first two remove the item from the list and show it in a
named, struck-through section — "left behind on purpose", "not on your list,
because they have it" — with a one-tap way back. Inventory state never removes
anything at all.

**Rationale.** What you are relying on somebody else for is precisely what gets
forgotten, and an item that vanished for a reason you cannot see is
indistinguishable from an item that never qualified. A missing household is
treated as no coverage: better to pack a second stove than to leave the only one
behind.

---

## ADR-019 — Jurisdiction and seasonal hazards prompt; they do not assert

**Context.** §7 asks for jurisdiction awareness and seasonal hazards keyed to
the dates.

**Decision.** The app cannot know which side of a boundary you are on, so it
asks, and each jurisdiction gets prompts covering fires, dogs, stay limits,
permits and — for Crown land and First Nations territory — protocol. Seasonal
hazards are keyed to the month of the start date and each carries a `check`
field naming what the app cannot verify.

**Rationale.** The failure mode of a confident hazard list is worse than the
failure mode of a prompt: it implies a check nobody made. Same principle as
ADR-004. Spring and fall bears are separate hazards with different advice
because they are different problems — green-up on valley bottoms versus
hyperphagia at berry patches.

---

## ADR-020 — A proposal must name its evidence, or be advisory

**Context.** Phase 6 turns post-trip reviews into rule edits. The temptation is
to make every observation produce an edit.

**Decision.** Each proposal carries the trips it came from and the values
observed on them: *"Packed and never touched on 2 trips (July at Porteau,
August at Alice Lake). On those trips daytimeHigh was 24, 26."* Where no
defensible edit can be computed — an item with no numeric threshold, a thing
that was never in the library at all — the proposal has `apply: null` and says
so, rather than inventing a change.

Thresholds also differ by direction. Two "unused" reports are needed before
tightening; one "missing" report is enough to propose loosening. Carrying
something you did not need costs a little space; not having it can end the trip.

**Consequence.** The app never silently edits the library. Every change is an
offered diff in plain English that the user accepts.

---

## ADR-021 — Once you have acted on the evidence, the loop goes quiet

**Context.** After applying a tightening edit, the same two unused reports still
exist, and a naive implementation re-raises them — first as the same proposal,
then as an advisory once the threshold move became a no-op.

**Decision.** When the computed threshold equals the current one, the item is
skipped entirely — not merely skipped for that proposal kind.

**Rationale.** Re-raising settled evidence is how a suggestions panel becomes
something you stop reading, and a panel nobody reads is worse than no panel.

---

## ADR-022 — A new trip inherits durable choices and nothing that happened

**Context.** Creating a trip copied the previous one wholesale, which carried
the previous trip's completed review forward.

**Decision.** A new trip keeps the style, the vehicle, the racks and who packs
which container. It resets attendees, activities, shelters, site answers, meal
plan, left-behind, coverage, households, camp roles and — critically — the
review.

**Rationale.** Found in browser verification. A duplicated completed review
would have handed the learning loop a second, fabricated observation of the same
event, which is exactly enough to trip the two-report threshold and generate a
rule edit from evidence that does not exist. There is a regression test that
demonstrates the fabrication and then the fix.

---

## ADR-023 — Density comes from grouped-inset lists, not from smaller type

**Context.** The first design put a 1px border on every row. At 1440×900 that
gave nine visible items out of two hundred, inside a 960px column with 480px of
dead space, behind three stacked bands of chrome.

**Decision.** Rows live inside a card with hairlines between them, rounded only
at the ends — one border per group instead of one per row. Chrome collapsed into
a single toolbar. On a wide screen groups flow into two columns.

**Result.** Forty-one rows visible instead of nine, at the same legible type
size. Density came from removing borders and bands, not from shrinking text.

---

## ADR-024 — Control size scales with the pointer, not the viewport

**Context.** "Dense" and "44px touch targets in the rain with cold hands" are
in direct conflict, and viewport width is the wrong proxy — a touch laptop is
wide, a phone in landscape is not narrow.

**Decision.** Row and control heights are tokens overridden under
`@media (pointer: fine)`. Coarse pointers get 46–50px, precise pointers get
32–34px.

**Consequence, found by measuring.** Segmented buttons subtract track padding
from `--control-h`, so setting the token to 44 left the real target at 38. The
tokens are the OUTER height and are sized so that what remains after the
subtraction still clears 44. Verified under device emulation, because a desktop
browser at phone width still reports a fine pointer and the check silently
passes.

---

## ADR-025 — The focus ring is per-theme, because "unmissable" is per-theme

**Context.** The original design used hi-vis yellow for focus in all three
themes, on the reasoning that hi-vis is unmissable.

**Decision.** `--flag` is defined per theme: burnt orange on light, hi-vis
yellow on dark, coral on red-light.

**Rationale.** The contrast audit measured yellow-on-white at 1.51:1. Hi-vis
yellow is unmissable against a dark van interior and nearly invisible against a
white page. The principle was right and the implementation assumed one colour
could satisfy it everywhere. The eye would not have caught this; the arithmetic
did.

---

## ADR-026 — Apple-clean, with the field register kept only where it works

**Context.** The original brief asked for equipment rather than decoration —
tarp blue, hi-vis, condensed type, field manuals. A later request asked for
sleek, modern, Apple-inspired.

**Decision.** Neutral greys carry structure, one accent carries state, chrome is
translucent and blurred. Three things from the field original survive because
they still earn their place: mono for quantities and rule text, where consistent
digit width genuinely matters; a hi-vis focus ring; and the load plan drawn as a
technical diagram rather than an illustration.

**What was dropped:** condensed display type, the tarp/spruce/hi-vis palette as
structural colour, and uppercase on buttons and nav.
