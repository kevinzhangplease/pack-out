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
 * Trip work follows the workflow — Plan, Shop, Prep, Load, Go, Review — because
 * that is the order the work actually happens in and it answers "what now?".
 * The Library sits outside that sequence because it has a different lifetime:
 * it is edited between trips, not during one, and burying rule editing inside
 * "Plan" would misrepresent what it is.
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

const THEMES: { id: Theme; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'night', label: 'Night' },
  { id: 'redlight', label: 'Red' },
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">PACK OUT</span>
        </div>
        <p className="topbar__trip">
          {trip ? (
            <>
              <strong>{trip.name}</strong>
              <span className="topbar__dates">
                {trip.startDate} → {trip.endDate}
              </span>
            </>
          ) : (
            'No trip'
          )}
        </p>
        <div className="segmented segmented--sm" role="group" aria-label="Light mode">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={ui.theme === theme.id ? 'segmented__btn is-active' : 'segmented__btn'}
              aria-pressed={ui.theme === theme.id}
              onClick={() => setTheme(theme.id)}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        <ol className="nav__steps">
          {WORKFLOW.map((step, i) => (
            <li key={step.id}>
              <button
                type="button"
                className={at === step.id ? 'nav__tab is-active' : 'nav__tab'}
                aria-current={at === step.id ? 'page' : undefined}
                onClick={() => setAt(step.id)}
              >
                <span className="nav__num">{i + 1}</span>
                {step.label}
              </button>
            </li>
          ))}
        </ol>
        <div className="nav__aside">
          <button
            type="button"
            className={at === 'library' ? 'nav__tab is-active' : 'nav__tab'}
            aria-current={at === 'library' ? 'page' : undefined}
            onClick={() => setAt('library')}
          >
            Library
          </button>
          <button
            type="button"
            className={at === 'data' ? 'nav__tab is-active' : 'nav__tab'}
            aria-current={at === 'data' ? 'page' : undefined}
            onClick={() => setAt('data')}
          >
            Data
          </button>
        </div>
      </nav>

      <main className="main">
        {at === 'plan' && <PlanView onEditItem={goToItem} />}
        {at === 'shop' && <ShopView />}
        {at === 'prep' && <PrepView onEditItem={goToItem} />}
        {at === 'load' && (
          <>
            <div className="segmented segmented--modes" role="group" aria-label="Load view">
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
