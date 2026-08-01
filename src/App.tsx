import { useState } from 'react';
import { useStore, type Theme } from './state/store';
import { ListView } from './views/ListView';
import { PlanView } from './views/PlanView';
import { ShopView } from './views/ShopView';
import { PrepView } from './views/PrepView';
import { LoadPlanView } from './views/LoadPlanView';
import { KidListView } from './views/KidListView';
import { GoView } from './views/GoView';
import { ReviewView } from './views/ReviewView';
import { LibraryView } from './views/LibraryView';
import { DataView } from './views/DataView';

/**
 * Navigation is hybrid, on purpose.
 *
 * Trip work follows the workflow — Plan, Food, Prep, Load, Go, Review — because
 * that is the order the work actually happens in and it answers "what now?".
 * The Library sits outside that sequence because it has a different lifetime:
 * it is edited between trips, not during one, and burying rule editing inside
 * "Plan" would misrepresent what it is.
 *
 * The same list of destinations renders as a scrolling strip on a phone and as
 * a sidebar rail on a desktop. One structure, two layouts, no duplicated markup.
 */
type Destination = 'plan' | 'shop' | 'prep' | 'load' | 'go' | 'review' | 'library' | 'data';

const WORKFLOW: { id: Destination; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'shop', label: 'Food' },
  { id: 'prep', label: 'Prep' },
  { id: 'load', label: 'Load' },
  { id: 'go', label: 'Go' },
  { id: 'review', label: 'Review' },
];

const ASIDE: { id: Destination; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'data', label: 'Data' },
];

const THEMES: { id: Theme; label: string; title: string }[] = [
  { id: 'day', label: 'Day', title: 'Daylight' },
  { id: 'night', label: 'Night', title: 'Night' },
  { id: 'redlight', label: 'Red', title: 'Red light — preserves night vision' },
];

const LOAD_MODES = [
  { id: 'list', label: 'List' },
  { id: 'plan', label: 'Load plan' },
  { id: 'kid', label: 'Kid list' },
] as const;
type LoadMode = (typeof LOAD_MODES)[number]['id'];

export function App() {
  const { trip, ui, setTheme } = useStore();
  const [at, setAt] = useState<Destination>('load');
  const [loadMode, setLoadMode] = useState<LoadMode>('list');
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const goToItem = (itemId: string) => {
    setFocusItemId(itemId);
    setAt('library');
  };

  const tab = (step: { id: Destination; label: string }, index?: number) => (
    <li key={step.id}>
      <button
        type="button"
        className={at === step.id ? 'nav__tab is-active' : 'nav__tab'}
        aria-current={at === step.id ? 'page' : undefined}
        onClick={() => setAt(step.id)}
      >
        {index !== undefined && <span className="nav__num">{index + 1}</span>}
        {step.label}
      </button>
    </li>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Pack Out</span>
        </div>

        <p className="topbar__trip">
          {trip ? (
            <>
              <span className="topbar__name">{trip.name}</span>
              <span className="topbar__dates">
                {trip.startDate} → {trip.endDate}
              </span>
            </>
          ) : (
            <span className="topbar__name">No trip</span>
          )}
        </p>

        <div className="segmented segmented--sm" role="group" aria-label="Light mode">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={ui.theme === theme.id ? 'segmented__btn is-active' : 'segmented__btn'}
              aria-pressed={ui.theme === theme.id}
              title={theme.title}
              onClick={() => setTheme(theme.id)}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        <ol className="nav__group">{WORKFLOW.map((step, i) => tab(step, i))}</ol>
        <span className="nav__rule" aria-hidden="true" />
        <ul className="nav__group">{ASIDE.map((step) => tab(step))}</ul>
      </nav>

      <main className="main">
        {at === 'plan' && <PlanView onEditItem={goToItem} />}
        {at === 'shop' && <ShopView />}
        {at === 'prep' && <PrepView onEditItem={goToItem} />}
        {at === 'load' && (
          <>
            <div className="segmented" role="group" aria-label="Load view">
              {LOAD_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={loadMode === mode.id ? 'segmented__btn is-active' : 'segmented__btn'}
                  aria-pressed={loadMode === mode.id}
                  onClick={() => setLoadMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {loadMode === 'list' && <ListView onEditItem={goToItem} />}
            {loadMode === 'plan' && <LoadPlanView />}
            {loadMode === 'kid' && <KidListView />}
          </>
        )}
        {at === 'go' && <GoView />}
        {at === 'review' && <ReviewView onEditItem={goToItem} />}
        {at === 'library' && <LibraryView focusItemId={focusItemId} />}
        {at === 'data' && <DataView />}
      </main>
    </div>
  );
}
