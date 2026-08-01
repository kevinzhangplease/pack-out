import type { Cond, Item, Library, LeafCond, NumericField, SetField } from '../data/types';
import { leaves } from './conditions';
import { ruleToEnglish, namesFrom } from './english';

/**
 * A lint pass over the library, run in tests and surfaced in the UI.
 *
 * Honest scope: detecting unsatisfiability in general is a solver problem. This
 * catches the tractable, actually-common cases — disjoint set constraints,
 * inverted numeric bounds, dangling references, duplicates. It does NOT claim
 * a rule is satisfiable just because it produced no finding. `severity: 'error'`
 * means "this is definitely wrong"; 'warn' means "look at this".
 */
export type LintSeverity = 'error' | 'warn';

export interface LintFinding {
  code:
    | 'orphaned'
    | 'no-conditions'
    | 'contradiction'
    | 'dangling-ref'
    | 'duplicate'
    | 'missing-container'
    | 'no-weight'
    | 'always-only-personal'
    | 'retired-gear';
  severity: LintSeverity;
  itemId?: string;
  message: string;
}

const NUMERIC_BOUNDS = new Set<NumericField>([
  'nights',
  'days',
  'people',
  'driveHours',
  'overnightLow',
  'daytimeHigh',
  'windKph',
]);

/** Set fields that hold exactly one value on a trip, so "any of" is exclusive. */
const SINGLE_VALUED = new Set<SetField>(['style', 'transport', 'precip']);

function contradictions(item: Item): string[] {
  // Only an all-mode rule can contradict itself; an any-mode rule with a
  // false branch is just a rule with a false branch.
  if (item.rule.mode !== 'all') return [];
  const flat = leaves(item.rule).filter(
    (c) => !item.rule.conds.some((top) => top.kind === 'group' && top.mode === 'any' && top.conds.includes(c)),
  );
  const found: string[] = [];

  // Inverted numeric bounds: at least 5 AND at most 3.
  const mins = new Map<NumericField, number>();
  const maxs = new Map<NumericField, number>();
  const exacts = new Map<NumericField, number>();
  for (const c of flat) {
    if (c.kind !== 'numeric' || !NUMERIC_BOUNDS.has(c.field)) continue;
    if (c.op === 'atLeast') mins.set(c.field, Math.max(mins.get(c.field) ?? -Infinity, c.value));
    if (c.op === 'atMost') maxs.set(c.field, Math.min(maxs.get(c.field) ?? Infinity, c.value));
    if (c.op === 'exactly') exacts.set(c.field, c.value);
  }
  for (const [field, min] of mins) {
    const max = maxs.get(field);
    if (max !== undefined && min > max) {
      found.push(`${field} must be at least ${min} and at most ${max} — never satisfiable`);
    }
    const exact = exacts.get(field);
    if (exact !== undefined && exact < min) {
      found.push(`${field} must be exactly ${exact} and at least ${min} — never satisfiable`);
    }
  }
  for (const [field, max] of maxs) {
    const exact = exacts.get(field);
    if (exact !== undefined && exact > max) {
      found.push(`${field} must be exactly ${exact} and at most ${max} — never satisfiable`);
    }
  }

  // Same field required to be in X and not in X.
  const positives = new Map<SetField, Set<string>>();
  const negatives = new Map<SetField, Set<string>>();
  for (const c of flat) {
    if (c.kind !== 'set') continue;
    const target = c.not ? negatives : positives;
    const existing = target.get(c.field) ?? new Set<string>();
    c.values.forEach((v) => existing.add(v));
    target.set(c.field, existing);
  }
  for (const [field, pos] of positives) {
    const neg = negatives.get(field);
    if (neg && [...pos].every((v) => neg.has(v))) {
      found.push(`${field} must include and exclude the same values — never satisfiable`);
    }
  }

  // Two exclusive "any of" constraints on a single-valued field: the trip has
  // one style, so requiring both a car-camping set and a backcountry set is dead.
  for (const field of SINGLE_VALUED) {
    const sets = flat.filter(
      (c): c is Extract<LeafCond, { kind: 'set' }> => c.kind === 'set' && c.field === field && !c.not,
    );
    if (sets.length < 2) continue;
    const intersection = sets.reduce<Set<string>>(
      (acc, c) => new Set(c.values.filter((v) => acc.has(v))),
      new Set(sets[0]!.values),
    );
    if (intersection.size === 0) {
      found.push(`${field} is single-valued but must match two disjoint sets — never satisfiable`);
    }
  }

  // Both answers demanded of one yes/no site question.
  const siteSeen = new Map<string, boolean>();
  for (const c of flat) {
    if (c.kind !== 'site') continue;
    const prev = siteSeen.get(c.question);
    if (prev !== undefined && prev !== c.value) {
      found.push(`site question "${c.question}" must be both yes and no — never satisfiable`);
    }
    siteSeen.set(c.question, c.value);
  }

  return found;
}

function danglingRefs(item: Item, library: Library): string[] {
  const found: string[] = [];
  const check = (cond: Cond) => {
    if (cond.kind === 'group') return cond.conds.forEach(check);
    if (cond.kind !== 'set') return;
    const pool =
      cond.field === 'activity'
        ? library.activities
        : cond.field === 'person'
          ? library.people
          : cond.field === 'vehicle'
            ? library.vehicles
            : null;
    if (!pool) return;
    for (const value of cond.values) {
      if (!pool.some((x) => x.id === value)) {
        found.push(`references ${cond.field} "${value}", which no longer exists`);
      }
    }
  };
  item.rule.conds.forEach(check);
  return found;
}

export function lintLibrary(library: Library): LintFinding[] {
  const findings: LintFinding[] = [];
  const names = namesFrom(library);
  const containerIds = new Set(library.containers.map((c) => c.id));
  const seen = new Map<string, string>();

  for (const item of library.items) {
    if (item.rule.conds.length === 0) {
      findings.push({
        code: 'no-conditions',
        severity: 'error',
        itemId: item.id,
        message: `"${item.name}" has no conditions. It will not pack. Give it an explicit "always" condition if that is what you meant.`,
      });
    }

    if (item.orphaned) {
      findings.push({
        code: 'orphaned',
        severity: 'error',
        itemId: item.id,
        message: `"${item.name}" is orphaned — the last thing its rule depended on was deleted. It is excluded from every list until you repair it.`,
      });
    }

    for (const message of contradictions(item)) {
      findings.push({
        code: 'contradiction',
        severity: 'error',
        itemId: item.id,
        message: `"${item.name}" can never pack: ${message}. Rule reads: ${ruleToEnglish(item.rule, names)}`,
      });
    }

    for (const message of danglingRefs(item, library)) {
      findings.push({
        code: 'dangling-ref',
        severity: 'error',
        itemId: item.id,
        message: `"${item.name}" ${message}.`,
      });
    }

    if (!containerIds.has(item.container)) {
      findings.push({
        code: 'missing-container',
        severity: 'warn',
        itemId: item.id,
        message: `"${item.name}" is assigned to container "${item.container}", which does not exist.`,
      });
    }

    if (item.type === 'gear' && item.weight_g <= 0) {
      findings.push({
        code: 'no-weight',
        severity: 'warn',
        itemId: item.id,
        message: `"${item.name}" has no weight. Pack weight totals and the shakedown pass will under-report.`,
      });
    }

    if (item.gear?.condition === 'retired' || item.gear?.condition === 'needs-repair') {
      findings.push({
        code: 'retired-gear',
        severity: 'warn',
        itemId: item.id,
        message: `"${item.name}" is marked ${item.gear.condition} but still packs. Repair it, replace it, or change the rule.`,
      });
    }

    const dupeKey = `${item.name.toLowerCase()}::${item.category}`;
    const prior = seen.get(dupeKey);
    if (prior) {
      findings.push({
        code: 'duplicate',
        severity: 'warn',
        itemId: item.id,
        message: `"${item.name}" duplicates item ${prior} in the same category.`,
      });
    } else {
      seen.set(dupeKey, item.id);
    }
  }

  return findings;
}

export function lintSummary(findings: LintFinding[]): string {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.length - errors;
  if (!findings.length) return 'Library is clean';
  return `${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`;
}
