import {
  SITE_QUESTION_LABELS,
  type Cond,
  type Library,
  type NumericField,
  type NumericOp,
  type Qty,
  type Rule,
  type SetField,
} from '../data/types';

/**
 * Every rule must render to plain language. This module is the single source of
 * that language — the UI never hand-writes an explanation, and the info panels,
 * the item rows and the text export all read from here.
 */

export interface Names {
  label(field: SetField, value: string): string;
}

/** Resolves ids to names. Falls back to the raw id so a dangling ref is visible. */
export function namesFrom(library: Library): Names {
  const find = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name ?? `${id} (missing)`;
  return {
    label(field, value) {
      switch (field) {
        case 'activity':
          return find(library.activities, value);
        case 'person':
          return find(library.people, value);
        case 'vehicle':
          return find(library.vehicles, value);
        default:
          return humanise(value);
      }
    },
  };
}

export const PLAIN_NAMES: Names = { label: (_f, v) => humanise(v) };

export function humanise(token: string): string {
  return token.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

const NUMERIC_NOUNS: Record<NumericField, string> = {
  nights: 'nights',
  days: 'days',
  people: 'people',
  driveHours: 'drive hours',
  overnightLow: 'the overnight low',
  daytimeHigh: 'the daytime high',
  windKph: 'the wind',
};

const NUMERIC_UNITS: Partial<Record<NumericField, string>> = {
  overnightLow: '°C',
  daytimeHigh: '°C',
  windKph: ' km/h',
};

const OP_WORDS: Record<NumericOp, string> = {
  atLeast: 'is at least',
  atMost: 'is at most',
  exactly: 'is exactly',
};

const SET_NOUNS: Record<SetField, string> = {
  style: 'the trip style',
  transport: 'transport',
  activity: 'the activities',
  person: 'the people going',
  role: 'the roles going',
  precip: 'precipitation',
  vehicle: 'the vehicles',
  rack: 'the racks',
};

function joinList(parts: string[], conjunction: 'or' | 'and'): string {
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0]!;
  const head = parts.slice(0, -1).join(', ');
  return `${head} ${conjunction} ${parts[parts.length - 1]!}`;
}

export function condToEnglish(cond: Cond, names: Names = PLAIN_NAMES): string {
  switch (cond.kind) {
    case 'always':
      return 'always';
    case 'numeric': {
      const unit = NUMERIC_UNITS[cond.field] ?? '';
      return `${NUMERIC_NOUNS[cond.field]} ${OP_WORDS[cond.op]} ${cond.value}${unit}`;
    }
    case 'site':
      return cond.value
        ? SITE_QUESTION_LABELS[cond.question]
        : `NOT: ${SITE_QUESTION_LABELS[cond.question]}`;
    case 'set': {
      const labels = cond.values.map((v) => names.label(cond.field, v));
      const verb = cond.not ? 'include none of' : 'include any of';
      return `${SET_NOUNS[cond.field]} ${verb} ${joinList(labels, 'or')}`;
    }
    case 'group': {
      const inner = cond.conds.map((c) => condToEnglish(c, names));
      return `(${joinList(inner, cond.mode === 'any' ? 'or' : 'and')})`;
    }
  }
}

export function ruleToEnglish(rule: Rule, names: Names = PLAIN_NAMES): string {
  const parts = rule.conds.map((c) => condToEnglish(c, names));
  if (parts.length === 1) {
    const only = parts[0]!;
    return only === 'always' ? 'Packs on every trip' : `Packs when ${only}`;
  }
  return `Packs when ${joinList(parts, rule.mode === 'any' ? 'or' : 'and')}`;
}

const QTY_UNIT_WORDS: Record<Qty['unit'], string> = {
  flat: '',
  perNight: ' per night',
  perDay: ' per day',
  perPerson: ' per person',
  perAdult: ' per adult',
  perKid: ' per kid',
  perPersonDay: ' per person per day',
  perShelter: ' per shelter',
};

export function qtyToEnglish(qty: Qty): string {
  const parts: string[] = [];
  if (qty.unit === 'flat' || qty.rate === 0) {
    parts.push(`${qty.base + (qty.unit === 'flat' ? qty.rate : 0)}`);
  } else {
    if (qty.base !== 0) parts.push(`${qty.base} plus`);
    parts.push(`${qty.rate}${QTY_UNIT_WORDS[qty.unit]}`);
  }
  if (qty.cap !== undefined) parts.push(`(max ${qty.cap})`);
  if (qty.perPerson) parts.push('- issued to each person');
  return parts.join(' ');
}
