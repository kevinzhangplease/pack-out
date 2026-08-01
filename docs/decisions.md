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
