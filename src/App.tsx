import { useState } from 'react';
import { useStore, type Theme } from './state/store';
import { ListView } from './views/ListView';
import { PlanView } from './views/PlanView';
import { ShopView } from './views/ShopView';
import { PrepView } from './views/PrepView';
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

const WORKFLOW: { id: Destination; label: string; phase: number }[] = [
  { id: 'plan', label: 'Plan', phase: 1 },
  { id: 'shop', label: 'Food', phase: 1 },
  { id: 'prep', label: 'Prep', phase: 1 },
  { id: 'load', label: 'Load', phase: 1 },
  { id: 'go', label: 'Go', phase: 5 },
  { id: 'review', label: 'Review', phase: 6 },
];

const THEMES: { id: Theme; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'night', label: 'Night' },
  { id: 'redlight', label: 'Red' },
];

export function App() {
  const { trip, ui, setTheme } = useStore();
  const [at, setAt] = useState<Destination>('load');
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const goToItem = (itemId: string) => {
    setFocusItemId(itemId);
    setAt('library');
  };

  const pending = WORKFLOW.find((step) => step.id === at && step.phase > 1);

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
        {at === 'load' && <ListView onEditItem={goToItem} />}
        {at === 'library' && <LibraryView focusItemId={focusItemId} />}
        {at === 'data' && <DataView />}
        {pending && (
          <section className="panel panel--pending">
            <h2 className="panel__title">{pending.label} arrives in phase {pending.phase}</h2>
            <p className="panel__lede">
              Not built yet, and showing you an empty shell that looks functional would be worse
              than saying so. The engine underneath is complete — everything on this screen will be
              generated from the same rules the Load list already uses.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
