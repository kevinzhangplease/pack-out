import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { lintLibrary, lintSummary } from '../engine/lint';
import { buildList } from '../engine/build';
import { ruleToEnglish, namesFrom, qtyToEnglish } from '../engine/english';
import { upsertItem } from '../engine/mutations';
import { GEAR_CONDITIONS, PHASE_LABELS, type GearCondition, type Item } from '../data/types';

/**
 * The library is the valuable thing in the app, so this view leads with its
 * health — the lint pass — rather than with a search box.
 */
export function LibraryView({ focusItemId }: { focusItemId: string | null }) {
  const { library, trip, setLibrary } = useStore();
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);

  const names = useMemo(() => namesFrom(library), [library]);
  const findings = useMemo(() => lintLibrary(library), [library]);
  const packing = useMemo(() => {
    if (!trip) return new Set<string>();
    return new Set(buildList(trip, library).lines.map((l) => l.item.id));
  }, [trip, library]);

  const byItem = useMemo(() => {
    const map = new Map<string, typeof findings>();
    for (const finding of findings) {
      if (!finding.itemId) continue;
      const bucket = map.get(finding.itemId);
      if (bucket) bucket.push(finding);
      else map.set(finding.itemId, [finding]);
    }
    return map;
  }, [findings]);

  const items = library.items.filter((item) => {
    if (onlyProblems && !byItem.has(item.id)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.includes(q) ||
      ruleToEnglish(item.rule, names).toLowerCase().includes(q)
    );
  });

  const errors = findings.filter((f) => f.severity === 'error');

  return (
    <div className="library">
      <section className={errors.length ? 'lint lint--bad' : 'lint'}>
        <h2 className="lint__title">Library health</h2>
        <p className="lint__summary">
          {library.items.length} items. {lintSummary(findings)}.
        </p>
        {findings.length > 0 && (
          <ul className="lint__list">
            {findings.slice(0, 12).map((finding, i) => (
              <li key={i} className={`lint__row lint__row--${finding.severity}`}>
                <span className="lint__code">{finding.code}</span> {finding.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="library__bar">
        <input
          type="search"
          className="input"
          placeholder="Search items and rules"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search items and rules"
        />
        <label className="check-inline">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />
          Only items with findings
        </label>
      </div>

      <ul className="items">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            english={ruleToEnglish(item.rule, names)}
            packing={packing.has(item.id)}
            problems={byItem.get(item.id)?.map((f) => f.message) ?? []}
            focused={focusItemId === item.id}
            onGearChange={(gear) =>
              setLibrary(upsertItem(library, { ...item, gear }), `update ${item.name}`)
            }
          />
        ))}
      </ul>
      {items.length === 0 && <p className="empty">Nothing matches that.</p>}
    </div>
  );
}

function ItemCard({
  item,
  english,
  packing,
  problems,
  focused,
  onGearChange,
}: {
  item: Item;
  english: string;
  packing: boolean;
  problems: string[];
  focused: boolean;
  onGearChange: (gear: Item['gear']) => void;
}) {
  return (
    <li
      className={focused ? 'item-card is-focused' : 'item-card'}
      ref={focused ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
    >
      <div className="item-card__head">
        <h3 className="item-card__name">{item.name}</h3>
        <span className={packing ? 'pill pill--on' : 'pill'}>
          {packing ? 'packing now' : 'not on this trip'}
        </span>
      </div>
      <p className="item-card__rule">{english}</p>
      <p className="item-card__qty">{qtyToEnglish(item.qty)}</p>
      <p className="item-card__meta">
        {item.category} · {item.container} · {PHASE_LABELS[item.phase]} · {item.kind}
        {item.scented ? ' · scented' : ''}
        {item.weight_g ? ` · ${item.weight_g} g` : ''}
      </p>
      {item.note && <p className="item-card__note">{item.note}</p>}
      {problems.map((problem, i) => (
        <p key={i} className="item-card__problem">
          {problem}
        </p>
      ))}

      {item.type === 'gear' && (
        <details className="item-card__gear">
          <summary>
            Condition
            {item.gear?.condition && item.gear.condition !== 'ok' && (
              <span className="tag tag--bad">{item.gear.condition}</span>
            )}
          </summary>
          <div className="fields">
            <label className="field">
              <span className="field__label">State</span>
              <select
                className="input"
                value={item.gear?.condition ?? 'unknown'}
                onChange={(e) =>
                  onGearChange({ ...item.gear, condition: e.target.value as GearCondition })
                }
              >
                {GEAR_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Fuel / charge</span>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                className="input"
                value={Math.round((item.gear?.level ?? 1) * 100)}
                onChange={(e) => onGearChange({ ...item.gear, level: Number(e.target.value) / 100 })}
              />
              <span className="field__hint">
                {Math.round((item.gear?.level ?? 1) * 100)}% — annotates the row and feeds the
                shopping list. It never removes anything from the packing list.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Borrowed from</span>
              <input
                type="text"
                className="input"
                value={item.gear?.borrowedFrom ?? ''}
                onChange={(e) => onGearChange({ ...item.gear, borrowedFrom: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Loaned to</span>
              <input
                type="text"
                className="input"
                value={item.gear?.loanedTo ?? ''}
                onChange={(e) => onGearChange({ ...item.gear, loanedTo: e.target.value })}
              />
            </label>
          </div>
        </details>
      )}
    </li>
  );
}
