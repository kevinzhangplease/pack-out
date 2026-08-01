import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useFood } from '../state/useFood';
import { groupLines, type GroupBy, type ListLine } from '../engine/build';
import { applyLeftBehind, byResponsibility } from '../engine/load';
import { applyCoverage } from '../engine/judgement';
import { evaluateGates, listIsQualified } from '../engine/gates';
import { listToText } from '../engine/textExport';
import { RuleTraceView } from '../components/RuleTrace';
import { PHASE_LABELS, type Phase } from '../data/types';

type Axis = GroupBy | 'responsibility';

const GROUPS: { id: Axis; label: string; hint: string }[] = [
  { id: 'container', label: 'Container', hint: 'Which bin, duffel or bag it lives in' },
  { id: 'category', label: 'Category', hint: 'Shelter, sleep, kitchen and so on' },
  { id: 'person', label: 'Person', hint: 'Per-person items under each person, shared gear apart' },
  {
    id: 'responsibility',
    label: 'Who packs',
    hint: 'Who is responsible for packing it — not the same as whose it is',
  },
  { id: 'phase', label: 'Timeline', hint: 'When it happens, not where it goes' },
];

const PHASE_ORDER: Phase[] = [
  'weeks-out',
  't-3-days',
  'night-before',
  'morning-of',
  'en-route',
  'last-out-door',
  'at-camp',
  'pack-down',
];

export function ListView({ onEditItem }: { onEditItem: (itemId: string) => void }) {
  const { trip, library, session, toggleCheck, toggleCollapsed, resetChecks } = useStore();
  const [by, setBy] = useState<Axis>('container');
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [showResident, setShowResident] = useState(false);

  // The list includes what the meal plan requires: cooking instruments, eating
  // instruments and the ingredients themselves.
  const food = useFood();
  const result = food?.list ?? null;
  const gates = useMemo(
    () => (trip && result ? evaluateGates(trip, result.facts, result) : []),
    [trip, result],
  );

  if (!trip || !result) {
    return <p className="empty">No trip selected.</p>;
  }

  const qualified = listIsQualified(gates);

  // Anything deliberately left behind after a shakedown is off the list, but
  // still visible on the Load plan screen rather than silently gone.
  const { going: notDropped, dropped } = applyLeftBehind(result.lines, trip.leftBehind);
  // Another household is bringing these. Off the list, but named on the Go
  // screen rather than silently absent.
  const coverage = applyCoverage(notDropped, trip);
  const going = coverage.ours;

  const visible = going.filter((l) => showResident || l.item.kind !== 'vehicle-resident');

  const groups = (
    by === 'responsibility'
      ? byResponsibility(visible, trip, library).map((g) => ({ ...g }))
      : groupLines(visible, by, library)
  ).sort((a, b) =>
    by === 'phase'
      ? PHASE_ORDER.indexOf(a.key as Phase) - PHASE_ORDER.indexOf(b.key as Phase)
      : a.label.localeCompare(b.label),
  );

  const checkedCount = visible.filter((l) => session.checked[l.key]).length;
  const residentCount = going.length - visible.length;

  const copyText = () => {
    void navigator.clipboard?.writeText(
      listToText(trip, library, { ...result, lines: going }, by === 'responsibility' ? 'person' : by, gates),
    );
  };

  return (
    <div className="list">
      {gates.length > 0 && (
        <section className="gates" aria-label="Warnings">
          {gates.map((gate) => (
            <div
              key={gate.id}
              className={gate.severity === 'blocking' ? 'gate gate--blocking' : 'gate'}
            >
              <h3 className="gate__title">{gate.title}</h3>
              {gate.disclaimer && <p className="gate__disclaimer">{gate.disclaimer}</p>}
              <p className="gate__detail">{gate.detail}</p>
              {gate.reference && <p className="gate__ref">Check: {gate.reference}</p>}
            </div>
          ))}
        </section>
      )}

      <div className="list__bar">
        <div className="segmented" role="group" aria-label="Group the list by">
          {GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={by === group.id ? 'segmented__btn is-active' : 'segmented__btn'}
              aria-pressed={by === group.id}
              title={group.hint}
              onClick={() => setBy(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="list__meta">
          {/*
            A progress ring on a list the app has flagged as dangerous implies a
            check nobody made, so a blocking gate removes it.
          */}
          {qualified ? (
            <span className="list__unqualified">Qualified list — see the warning above</span>
          ) : (
            <span className="list__progress">
              <strong>{checkedCount}</strong> / {visible.length} packed
            </span>
          )}
          <span className="list__weight">{(result.totalWeight_g / 1000).toFixed(1)} kg</span>
        </div>
      </div>

      <div className="list__actions">
        <button type="button" className="btn btn--sm" onClick={copyText}>
          Copy as text
        </button>
        <button type="button" className="btn btn--sm" onClick={resetChecks}>
          Reset checks
        </button>
        {residentCount > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowResident((v) => !v)}
          >
            {showResident ? 'Hide' : 'Show'} {residentCount} that live in the vehicle
          </button>
        )}
      </div>

      {groups.map((group) => {
        const collapsed = session.collapsed[`${by}:${group.key}`] ?? false;
        const done = group.lines.filter((l) => session.checked[l.key]).length;
        const allDone = done === group.lines.length;
        const label = by === 'phase' ? PHASE_LABELS[group.key as Phase] : group.label;

        return (
          <section key={group.key} className={allDone ? 'group is-done' : 'group'}>
            <button
              type="button"
              className="group__head"
              aria-expanded={!collapsed}
              onClick={() => toggleCollapsed(`${by}:${group.key}`)}
            >
              <span className="group__chevron" aria-hidden="true">
                {collapsed ? '▸' : '▾'}
              </span>
              <h2 className="group__name">{label}</h2>
              <span className="group__count">
                {done}/{group.lines.length}
              </span>
              {group.weight_g > 0 && (
                <span className="group__weight">{(group.weight_g / 1000).toFixed(1)} kg</span>
              )}
            </button>

            {!collapsed && (
              <ul className="rows">
                {group.lines.map((line) => (
                  <Row
                    key={line.key}
                    line={line}
                    showPerson={by !== 'person'}
                    checked={session.checked[line.key] ?? false}
                    onToggle={() => toggleCheck(line.key)}
                    traceOpen={openTrace === line.key}
                    onTrace={() => setOpenTrace(openTrace === line.key ? null : line.key)}
                    onEdit={() => onEditItem(line.item.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {coverage.theirs.length > 0 && (
        <p className="editor__note">
          {coverage.theirs.length} item{coverage.theirs.length === 1 ? '' : 's'} covered by another
          household — {(coverage.savedWeight_g / 1000).toFixed(1)} kg you are not carrying. Named on
          the Go screen.
        </p>
      )}

      {dropped.length > 0 && (
        <p className="editor__note">
          {dropped.length} item{dropped.length === 1 ? '' : 's'} deliberately left behind. They are
          on the Load plan screen, struck through, not deleted.
        </p>
      )}

      {result.orphaned.length > 0 && (
        <section className="group group--orphans">
          <h2 className="group__name">Orphaned — excluded from every list</h2>
          <p className="orphan__note">
            These lost the last thing their rule depended on. They are not packing, and they will
            not start packing on their own.
          </p>
          <ul className="rows">
            {result.orphaned.map((item) => (
              <li key={item.id} className="row row--orphan">
                <span className="row__name">{item.name}</span>
                <button type="button" className="btn btn--sm" onClick={() => onEditItem(item.id)}>
                  Repair
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({
  line,
  checked,
  onToggle,
  traceOpen,
  onTrace,
  onEdit,
  showPerson,
}: {
  line: ListLine;
  checked: boolean;
  onToggle: () => void;
  traceOpen: boolean;
  onTrace: () => void;
  onEdit: () => void;
  showPerson: boolean;
}) {
  const { item } = line;
  // Durables that live packed need verifying, not checking. Checking off things
  // that never move trains you to tick without looking.
  const verb = item.kind === 'consumable' ? 'Restock' : item.type === 'action' ? 'Done' : 'Verify';

  return (
    <li className={checked ? 'row is-checked' : 'row'}>
      <label className="row__check">
        {/* A real checkbox, not a button with aria-pressed. */}
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="row__box" aria-hidden="true" />
        <span className="row__name">
          {item.name}
          {line.qty > 1 && <span className="row__qty">×{line.qty}</span>}
          {showPerson && line.person && <span className="row__who">{line.person.name}</span>}
        </span>
      </label>

      <span className="row__tags">
        <span className={`tag tag--${item.kind}`}>{verb}</span>
        {item.scented && <span className="tag tag--scented">scented</span>}
        {item.gear?.condition === 'needs-repair' && <span className="tag tag--bad">repair</span>}
      </span>

      <button
        type="button"
        className="row__why"
        aria-expanded={traceOpen}
        onClick={onTrace}
        title="Why is this here?"
      >
        why
      </button>

      {traceOpen && (
        <div className="row__trace">
          {item.note && <p className="row__note">{item.note}</p>}
          <RuleTraceView why={line.why} howMany={line.howMany} onEdit={onEdit} />
        </div>
      )}
    </li>
  );
}
