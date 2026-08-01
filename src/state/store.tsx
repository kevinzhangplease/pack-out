import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Library, Session, Trip } from '../data/types';
import { defaultLibrary } from '../data/library';
import { FAMILY_CAR_SUMMER } from '../data/fixtures';
import { KEYS, load, save } from './storage';

export type Theme = 'day' | 'night' | 'redlight';

interface UiState {
  theme: Theme;
  activeTripId: string;
}

interface UndoEntry {
  label: string;
  library: Library;
  trips: Trip[];
}

interface Store {
  library: Library;
  trips: Trip[];
  trip: Trip | undefined;
  session: Session;
  ui: UiState;

  setLibrary: (next: Library, undoLabel: string) => void;
  setTrips: (next: Trip[], undoLabel: string) => void;
  updateTrip: (next: Trip) => void;
  setActiveTrip: (id: string) => void;
  setTheme: (theme: Theme) => void;

  toggleCheck: (key: string) => void;
  toggleCollapsed: (key: string) => void;
  resetChecks: () => void;

  undo: () => void;
  undoLabel: string | null;
}

const StoreContext = createContext<Store | null>(null);

const emptySession = (tripId: string): Session => ({ tripId, checked: {}, collapsed: {} });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [library, setLibraryRaw] = useState<Library>(() =>
    load(KEYS.library, defaultLibrary(), true),
  );
  const [trips, setTripsRaw] = useState<Trip[]>(() => load(KEYS.trips, [FAMILY_CAR_SUMMER]));
  const [ui, setUi] = useState<UiState>(() =>
    load(KEYS.ui, { theme: 'day' as Theme, activeTripId: FAMILY_CAR_SUMMER.id }),
  );

  const activeTripId = trips.some((t) => t.id === ui.activeTripId)
    ? ui.activeTripId
    : (trips[0]?.id ?? '');

  const [session, setSession] = useState<Session>(() =>
    load(KEYS.session(activeTripId), emptySession(activeTripId)),
  );

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const lastLoadedTrip = useRef(activeTripId);

  // Session state is keyed by trip, so switching trips loads that trip's
  // checkboxes rather than carrying the previous trip's over.
  useEffect(() => {
    if (lastLoadedTrip.current === activeTripId) return;
    lastLoadedTrip.current = activeTripId;
    setSession(load(KEYS.session(activeTripId), emptySession(activeTripId)));
  }, [activeTripId]);

  // Packing happens at 9pm around bedtime and gets interrupted. Save on every
  // change, restore exactly, never lose a half-finished state.
  useEffect(() => save(KEYS.library, library), [library]);
  useEffect(() => save(KEYS.trips, trips), [trips]);
  useEffect(() => save(KEYS.ui, ui), [ui]);
  useEffect(() => save(KEYS.session(session.tripId), session), [session]);

  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);

  const pushUndo = useCallback(
    (label: string, prevLibrary: Library, prevTrips: Trip[]) => {
      setUndoStack((stack) =>
        [{ label, library: prevLibrary, trips: prevTrips }, ...stack].slice(0, 25),
      );
    },
    [],
  );

  const setLibrary = useCallback(
    (next: Library, undoLabel: string) => {
      pushUndo(undoLabel, library, trips);
      setLibraryRaw(next);
    },
    [library, trips, pushUndo],
  );

  const setTrips = useCallback(
    (next: Trip[], undoLabel: string) => {
      pushUndo(undoLabel, library, trips);
      setTripsRaw(next);
    },
    [library, trips, pushUndo],
  );

  // Editing trip inputs is not destructive and should not fill the undo stack.
  const updateTrip = useCallback((next: Trip) => {
    setTripsRaw((all) => all.map((t) => (t.id === next.id ? next : t)));
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const [top, ...rest] = stack;
      if (!top) return stack;
      setLibraryRaw(top.library);
      setTripsRaw(top.trips);
      return rest;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      library,
      trips,
      trip: trips.find((t) => t.id === activeTripId),
      session,
      ui: { ...ui, activeTripId },
      setLibrary,
      setTrips,
      updateTrip,
      setActiveTrip: (id) => setUi((u) => ({ ...u, activeTripId: id })),
      setTheme: (theme) => setUi((u) => ({ ...u, theme })),
      toggleCheck: (key) =>
        setSession((s) => ({ ...s, checked: { ...s.checked, [key]: !s.checked[key] } })),
      toggleCollapsed: (key) =>
        setSession((s) => ({ ...s, collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      resetChecks: () => setSession((s) => ({ ...s, checked: {} })),
      undo,
      undoLabel: undoStack[0]?.label ?? null,
    }),
    [library, trips, activeTripId, session, ui, setLibrary, setTrips, updateTrip, undo, undoStack],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside a StoreProvider');
  return store;
}
