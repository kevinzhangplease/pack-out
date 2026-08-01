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
