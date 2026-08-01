import type {
  AlwaysCond,
  Category,
  Cond,
  GroupCond,
  Item,
  ItemKind,
  ItemType,
  LeafCond,
  NumericCond,
  NumericOp,
  Ownership,
  Phase,
  Precip,
  Qty,
  QtyUnit,
  Role,
  Rule,
  SetCond,
  SiteCond,
  SiteQuestion,
  Transport,
  TripStyle,
} from './types';

/**
 * A small authoring vocabulary for the default library.
 *
 * The library is the valuable thing in this app, so it should read like the
 * bylaw it is modelled on rather than like JSON. Everything here produces plain
 * data — nothing in this file makes a packing decision.
 */

export const always = (): AlwaysCond => ({ kind: 'always' });

export const style = (...values: TripStyle[]): SetCond => ({ kind: 'set', field: 'style', values });
export const notStyle = (...values: TripStyle[]): SetCond => ({
  kind: 'set',
  field: 'style',
  values,
  not: true,
});
export const transport = (...values: Transport[]): SetCond => ({
  kind: 'set',
  field: 'transport',
  values,
});
export const activity = (...values: string[]): SetCond => ({
  kind: 'set',
  field: 'activity',
  values,
});
export const noActivity = (...values: string[]): SetCond => ({
  kind: 'set',
  field: 'activity',
  values,
  not: true,
});
export const role = (...values: Role[]): SetCond => ({ kind: 'set', field: 'role', values });
export const precip = (...values: Precip[]): SetCond => ({ kind: 'set', field: 'precip', values });
export const rack = (...values: string[]): SetCond => ({ kind: 'set', field: 'rack', values });

export const site = (question: SiteQuestion, value = true): SiteCond => ({
  kind: 'site',
  question,
  value,
});
export const noSite = (question: SiteQuestion): SiteCond => ({ kind: 'site', question, value: false });

const num =
  (field: NumericCond['field']) =>
  (op: NumericOp, value: number): NumericCond => ({ kind: 'numeric', field, op, value });

export const nights = num('nights');
export const days = num('days');
export const people = num('people');
export const driveHours = num('driveHours');
export const low = num('overnightLow');
export const high = num('daytimeHigh');
export const wind = num('windKph');

/** One level of grouping: `when(activity('hiking'), anyOf(precip('rain'), precip('snow')))`. */
export const anyOf = (...conds: LeafCond[]): GroupCond => ({ kind: 'group', mode: 'any', conds });
export const allOf = (...conds: LeafCond[]): GroupCond => ({ kind: 'group', mode: 'all', conds });

/** All conditions must hold. The first argument is required — see ADR-001. */
export const when = (first: Cond, ...rest: Cond[]): Rule => ({ mode: 'all', conds: [first, ...rest] });
/** Any condition suffices. */
export const whenAny = (first: Cond, ...rest: Cond[]): Rule => ({
  mode: 'any',
  conds: [first, ...rest],
});

export const qty = (
  base: number,
  opts: { rate?: number; unit?: QtyUnit; perPerson?: boolean; cap?: number } = {},
): Qty => ({
  base,
  rate: opts.rate ?? 0,
  unit: opts.unit ?? 'flat',
  ...(opts.perPerson ? { perPerson: true } : {}),
  ...(opts.cap !== undefined ? { cap: opts.cap } : {}),
});

/** One per person on the list, rather than one pooled line. */
export const each = (base = 1): Qty => ({ base, rate: 0, unit: 'flat', perPerson: true });

interface ItemSpec {
  id: string;
  name: string;
  category: Category;
  container: string;
  rule: Rule;
  qty?: Qty;
  weight_g?: number;
  phase?: Phase;
  kind?: ItemKind;
  type?: ItemType;
  scented?: boolean;
  ownership?: Ownership;
  note?: string;
  gear?: Item['gear'];
}

export function item(spec: ItemSpec): Item {
  return {
    qty: qty(1),
    weight_g: 0,
    phase: 'night-before',
    kind: 'durable',
    type: 'gear',
    ownership: 'group',
    ...spec,
  };
}

/** An action is a task on the timeline, not a thing in a bin. */
export function action(spec: Omit<ItemSpec, 'container' | 'category'> & { category?: Category }): Item {
  return item({
    container: 'not-packed',
    category: spec.category ?? 'documents',
    kind: 'consumable',
    ...spec,
    type: 'action',
  });
}
