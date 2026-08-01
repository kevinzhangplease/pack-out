import { useMemo } from 'react';
import {
  NUMERIC_FIELDS,
  NUMERIC_OPS,
  PRECIPS,
  ROLES,
  SET_FIELDS,
  SITE_QUESTIONS,
  SITE_QUESTION_LABELS,
  TRANSPORTS,
  TRIP_STYLES,
  type Cond,
  type LeafCond,
  type Library,
  type NumericField,
  type NumericOp,
  type Rule,
  type SetField,
  type SiteQuestion,
} from '../data/types';
import { condToEnglish, humanise, namesFrom, ruleToEnglish } from '../engine/english';

/**
 * The condition builder.
 *
 * Field dropdown, any-of / none-of toggle, value chips — and a running plain
 * English rendering of the rule, because the English is the thing you actually
 * check. One level of grouping, as decided in ADR-007.
 *
 * The invariant this component must never break: a rule always has at least one
 * condition. Removing the last one is not offered; the "always" condition is
 * the way to say "packs on every trip".
 */

type LeafKind = 'always' | 'numeric' | 'set' | 'site';

const KIND_LABELS: Record<LeafKind, string> = {
  always: 'Always',
  numeric: 'A number',
  set: 'One of a list',
  site: 'A site answer',
};

const OP_LABELS: Record<NumericOp, string> = {
  atLeast: 'is at least',
  atMost: 'is at most',
  exactly: 'is exactly',
};

function defaultLeaf(kind: LeafKind): LeafCond {
  switch (kind) {
    case 'always':
      return { kind: 'always' };
    case 'numeric':
      return { kind: 'numeric', field: 'nights', op: 'atLeast', value: 1 };
    case 'set':
      return { kind: 'set', field: 'style', values: [] };
    case 'site':
      return { kind: 'site', question: 'bearCountry', value: true };
  }
}

/** The choosable values for each set field, resolved against the library. */
function optionsFor(field: SetField, library: Library): { value: string; label: string }[] {
  switch (field) {
    case 'style':
      return TRIP_STYLES.map((v) => ({ value: v, label: humanise(v) }));
    case 'transport':
      return TRANSPORTS.map((v) => ({ value: v, label: humanise(v) }));
    case 'precip':
      return PRECIPS.map((v) => ({ value: v, label: humanise(v) }));
    case 'role':
      return ROLES.map((v) => ({ value: v, label: v }));
    case 'activity':
      return library.activities.map((a) => ({ value: a.id, label: a.name }));
    case 'person':
      return library.people.map((p) => ({ value: p.id, label: p.name }));
    case 'vehicle':
      return library.vehicles.map((v) => ({ value: v.id, label: v.name }));
    case 'rack':
      return [...new Set(library.vehicles.flatMap((v) => v.racks))].map((r) => ({
        value: r,
        label: humanise(r),
      }));
  }
}

export function ConditionBuilder({
  rule,
  library,
  onChange,
}: {
  rule: Rule;
  library: Library;
  onChange: (rule: Rule) => void;
}) {
  const names = useMemo(() => namesFrom(library), [library]);

  const replaceCond = (index: number, cond: Cond) => {
    const conds = [...rule.conds];
    conds[index] = cond;
    onChange({ ...rule, conds: conds as Rule['conds'] });
  };

  const removeCond = (index: number) => {
    // Never allow the rule to reach zero conditions. See ADR-001.
    if (rule.conds.length <= 1) return;
    const conds = rule.conds.filter((_, i) => i !== index);
    onChange({ ...rule, conds: conds as Rule['conds'] });
  };

  const addCond = (cond: Cond) => onChange({ ...rule, conds: [...rule.conds, cond] as Rule['conds'] });

  return (
    <div className="builder">
      <p className="builder__english">{ruleToEnglish(rule, names)}</p>

      <div className="builder__mode">
        <span className="field__label">Match</span>
        <div className="segmented segmented--sm" role="group" aria-label="Match all or any">
          <button
            type="button"
            className={rule.mode === 'all' ? 'segmented__btn is-active' : 'segmented__btn'}
            aria-pressed={rule.mode === 'all'}
            onClick={() => onChange({ ...rule, mode: 'all' })}
          >
            All of these
          </button>
          <button
            type="button"
            className={rule.mode === 'any' ? 'segmented__btn is-active' : 'segmented__btn'}
            aria-pressed={rule.mode === 'any'}
            onClick={() => onChange({ ...rule, mode: 'any' })}
          >
            Any of these
          </button>
        </div>
      </div>

      <ul className="builder__conds">
        {rule.conds.map((cond, i) => (
          <li key={i} className="builder__cond">
            {cond.kind === 'group' ? (
              <div className="builder__group">
                <div className="builder__grouphead">
                  <span className="builder__grouplabel">
                    {cond.mode === 'any' ? 'Any of' : 'All of'}
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      replaceCond(i, { ...cond, mode: cond.mode === 'any' ? 'all' : 'any' })
                    }
                  >
                    Switch to {cond.mode === 'any' ? 'all' : 'any'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={rule.conds.length <= 1}
                    onClick={() => removeCond(i)}
                  >
                    Remove group
                  </button>
                </div>

                <ul className="builder__conds">
                  {cond.conds.map((leaf, j) => (
                    <li key={j} className="builder__cond">
                      <LeafEditor
                        cond={leaf}
                        library={library}
                        onChange={(next) => {
                          const conds = [...cond.conds];
                          conds[j] = next;
                          replaceCond(i, { ...cond, conds });
                        }}
                        onRemove={
                          cond.conds.length > 1
                            ? () =>
                                replaceCond(i, {
                                  ...cond,
                                  conds: cond.conds.filter((_, k) => k !== j),
                                })
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    replaceCond(i, { ...cond, conds: [...cond.conds, defaultLeaf('set')] })
                  }
                >
                  Add to this group
                </button>
              </div>
            ) : (
              <LeafEditor
                cond={cond}
                library={library}
                onChange={(next) => replaceCond(i, next)}
                onRemove={rule.conds.length > 1 ? () => removeCond(i) : undefined}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="builder__add">
        <button type="button" className="btn btn--sm" onClick={() => addCond(defaultLeaf('set'))}>
          Add a condition
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => addCond({ kind: 'group', mode: 'any', conds: [defaultLeaf('set')] })}
        >
          Add an any-of group
        </button>
      </div>

      {rule.conds.length === 1 && (
        <p className="builder__note">
          A rule always has at least one condition — that is what stops a stripped rule from
          silently packing on every trip. To make this pack always, change the condition to
          &ldquo;Always&rdquo;.
        </p>
      )}
    </div>
  );
}

function LeafEditor({
  cond,
  library,
  onChange,
  onRemove,
}: {
  cond: LeafCond;
  library: Library;
  onChange: (cond: LeafCond) => void;
  onRemove?: () => void;
}) {
  const names = useMemo(() => namesFrom(library), [library]);

  return (
    <div className="leaf">
      <div className="leaf__row">
        <select
          className="input input--inline"
          aria-label="Condition type"
          value={cond.kind}
          onChange={(e) => onChange(defaultLeaf(e.target.value as LeafKind))}
        >
          {(Object.keys(KIND_LABELS) as LeafKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>

        {cond.kind === 'numeric' && (
          <>
            <select
              className="input input--inline"
              aria-label="Field"
              value={cond.field}
              onChange={(e) => onChange({ ...cond, field: e.target.value as NumericField })}
            >
              {NUMERIC_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {humanise(field)}
                </option>
              ))}
            </select>
            <select
              className="input input--inline"
              aria-label="Operator"
              value={cond.op}
              onChange={(e) => onChange({ ...cond, op: e.target.value as NumericOp })}
            >
              {NUMERIC_OPS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="input input--inline input--num"
              aria-label="Value"
              value={cond.value}
              onChange={(e) => onChange({ ...cond, value: Number(e.target.value) })}
            />
          </>
        )}

        {cond.kind === 'set' && (
          <>
            <select
              className="input input--inline"
              aria-label="Field"
              value={cond.field}
              onChange={(e) =>
                onChange({ ...cond, field: e.target.value as SetField, values: [] })
              }
            >
              {SET_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {humanise(field)}
                </option>
              ))}
            </select>
            {/* The negative form is essential: "the site has no flush toilets"
                and "we are not hiking" both have to be expressible. */}
            <div className="segmented segmented--sm" role="group" aria-label="Include or exclude">
              <button
                type="button"
                className={!cond.not ? 'segmented__btn is-active' : 'segmented__btn'}
                aria-pressed={!cond.not}
                onClick={() => onChange({ ...cond, not: false })}
              >
                Any of
              </button>
              <button
                type="button"
                className={cond.not ? 'segmented__btn is-active' : 'segmented__btn'}
                aria-pressed={Boolean(cond.not)}
                onClick={() => onChange({ ...cond, not: true })}
              >
                None of
              </button>
            </div>
          </>
        )}

        {cond.kind === 'site' && (
          <>
            <select
              className="input input--inline"
              aria-label="Site question"
              value={cond.question}
              onChange={(e) => onChange({ ...cond, question: e.target.value as SiteQuestion })}
            >
              {SITE_QUESTIONS.map((question) => (
                <option key={question} value={question}>
                  {SITE_QUESTION_LABELS[question]}
                </option>
              ))}
            </select>
            <div className="segmented segmented--sm" role="group" aria-label="Answer">
              <button
                type="button"
                className={cond.value ? 'segmented__btn is-active' : 'segmented__btn'}
                aria-pressed={cond.value}
                onClick={() => onChange({ ...cond, value: true })}
              >
                Yes
              </button>
              <button
                type="button"
                className={!cond.value ? 'segmented__btn is-active' : 'segmented__btn'}
                aria-pressed={!cond.value}
                onClick={() => onChange({ ...cond, value: false })}
              >
                No
              </button>
            </div>
          </>
        )}

        {onRemove && (
          <button type="button" className="btn btn--sm" onClick={onRemove} aria-label="Remove condition">
            ✕
          </button>
        )}
      </div>

      {cond.kind === 'set' && (
        <ul className="chips chips--values">
          {optionsFor(cond.field, library).map((option) => {
            const on = cond.values.includes(option.value);
            return (
              <li key={option.value} className="chips__item">
                <label className={on ? 'chip chip--sm is-on' : 'chip chip--sm'}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        ...cond,
                        values: on
                          ? cond.values.filter((v) => v !== option.value)
                          : [...cond.values, option.value],
                      })
                    }
                  />
                  <span className="chip__label">{option.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {cond.kind === 'set' && cond.values.length === 0 && (
        <p className="leaf__warn">
          No values chosen. As written this condition can never pass, so nothing will pack.
        </p>
      )}

      <p className="leaf__english">{condToEnglish(cond, names)}</p>
    </div>
  );
}
