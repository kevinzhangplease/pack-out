import type {
  Cond,
  LeafCond,
  NumericField,
  Person,
  Rule,
  SetCond,
  SetField,
} from '../data/types';
import type { TripFacts } from './facts';
import { condToEnglish, PLAIN_NAMES, ruleToEnglish, type Names } from './english';

/**
 * Evaluation returns a TRACE. The boolean is derived from it, not the other way
 * round. Everything that explains the list — the "why is this here" line, the
 * per-section info panels, the diff, the text export — reads this structure,
 * so an explanation cannot drift away from the decision it describes.
 */
export interface CondTrace {
  cond: Cond;
  passed: boolean;
  english: string;
  /** What the trip actually said, for display next to the condition. */
  actual: string;
  children?: CondTrace[];
}

export interface RuleTrace {
  passed: boolean;
  english: string;
  conds: CondTrace[];
}

/** Per-person evaluation subject. Absent means "evaluate against the group". */
export interface EvalContext {
  subject?: Person;
  names?: Names;
}

/**
 * A set field resolves to the set of values the trip actually has.
 * Single-valued fields resolve to a one-element set so both operators behave
 * identically across all set fields.
 */
function resolveSet(field: SetField, facts: TripFacts, subject?: Person): Set<string> {
  switch (field) {
    case 'style':
      return new Set([facts.style]);
    case 'transport':
      return new Set([facts.transport]);
    case 'precip':
      return new Set([facts.precip]);
    case 'activity':
      return facts.activityIds;
    case 'vehicle':
      return facts.vehicleIds;
    case 'rack':
      return facts.rackIds;
    // Inside a per-person expansion these narrow to that one person, so
    // "role includes any of toddler" means *this* line's person is a toddler.
    case 'person':
      return subject ? new Set([subject.id]) : facts.personIds;
    case 'role':
      return subject ? new Set([subject.role]) : facts.roles;
  }
}

function evalSet(cond: SetCond, facts: TripFacts, subject?: Person): boolean {
  const actual = resolveSet(cond.field, facts, subject);
  const overlaps = cond.values.some((v) => actual.has(v));
  return cond.not ? !overlaps : overlaps;
}

function numericValue(field: NumericField, facts: TripFacts): number {
  switch (field) {
    case 'nights':
      return facts.nights;
    case 'days':
      return facts.days;
    case 'people':
      return facts.people;
    case 'driveHours':
      return facts.driveHours;
    case 'overnightLow':
      return facts.overnightLow;
    case 'daytimeHigh':
      return facts.daytimeHigh;
    case 'windKph':
      return facts.windKph;
  }
}

function describeActual(cond: Cond, facts: TripFacts, subject?: Person, names: Names = PLAIN_NAMES): string {
  switch (cond.kind) {
    case 'always':
      return '';
    case 'numeric':
      return `actually ${numericValue(cond.field, facts)}`;
    case 'site':
      return facts.site[cond.question] ? 'answered yes' : 'answered no';
    case 'set': {
      const actual = [...resolveSet(cond.field, facts, subject)];
      if (actual.length === 0) return 'nothing selected';
      return `actually ${actual.map((v) => names.label(cond.field, v)).join(', ')}`;
    }
    case 'group':
      return '';
  }
}

export function evalLeaf(cond: LeafCond, facts: TripFacts, subject?: Person): boolean {
  switch (cond.kind) {
    case 'always':
      return true;
    case 'numeric': {
      const actual = numericValue(cond.field, facts);
      if (cond.op === 'atLeast') return actual >= cond.value;
      if (cond.op === 'atMost') return actual <= cond.value;
      return actual === cond.value;
    }
    case 'site':
      return facts.site[cond.question] === cond.value;
    case 'set':
      return evalSet(cond, facts, subject);
  }
}

export function evalCondition(cond: Cond, facts: TripFacts, ctx: EvalContext = {}): CondTrace {
  const names = ctx.names ?? PLAIN_NAMES;

  if (cond.kind === 'group') {
    const children = cond.conds.map((c) => evalCondition(c, facts, ctx));
    // An empty group is vacuous, and vacuous must never mean true.
    const passed =
      children.length === 0
        ? false
        : cond.mode === 'all'
          ? children.every((c) => c.passed)
          : children.some((c) => c.passed);
    return { cond, passed, english: condToEnglish(cond, names), actual: '', children };
  }

  return {
    cond,
    passed: evalLeaf(cond, facts, ctx.subject),
    english: condToEnglish(cond, names),
    actual: describeActual(cond, facts, ctx.subject, names),
  };
}

export function evalRule(rule: Rule, facts: TripFacts, ctx: EvalContext = {}): RuleTrace {
  const conds = rule.conds.map((c) => evalCondition(c, facts, ctx));
  // `conds` is a non-empty tuple at the type level, but imported JSON can lie.
  // A rule with no conditions does not pack. It never means "always".
  const passed =
    conds.length === 0
      ? false
      : rule.mode === 'all'
        ? conds.every((c) => c.passed)
        : conds.some((c) => c.passed);
  return { passed, english: ruleToEnglish(rule, ctx.names ?? PLAIN_NAMES), conds };
}

/** Fields a rule reads. Powers the per-section info panels. */
export function fieldsRead(rule: Rule): Set<string> {
  const out = new Set<string>();
  const walk = (cond: Cond) => {
    switch (cond.kind) {
      case 'numeric':
        out.add(cond.field);
        break;
      case 'set':
        out.add(cond.field);
        break;
      case 'site':
        out.add(`site.${cond.question}`);
        break;
      case 'always':
        break;
      case 'group':
        cond.conds.forEach(walk);
        break;
    }
  };
  rule.conds.forEach(walk);
  return out;
}

/** Every leaf in a rule, flattened. Used by the linter and the info panels. */
export function leaves(rule: Rule): LeafCond[] {
  return rule.conds.flatMap((c) => (c.kind === 'group' ? c.conds : [c]));
}
