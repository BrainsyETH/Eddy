import { createLatestRequest } from './latestRequest';

export interface SavedFloatLoadState<T> {
  shortCode: string | null;
  plan: T | null;
  loading: boolean;
  error: string | null;
  checkedAt: string | null;
  showSaved: boolean;
}

export function emptySavedFloatState<T>(): SavedFloatLoadState<T> {
  return { shortCode: null, plan: null, loading: true, error: null, checkedAt: null, showSaved: false };
}

/** Fast opens avoid a fallback flash; slow/offline opens still expose logistics. */
export function createSavedFloatLoader<T>({ fetchPlan, isOffline, publish, onSuccess, errorMessage }: {
  fetchPlan: (shortCode: string, signal: AbortSignal) => Promise<T>;
  isOffline: () => Promise<boolean>;
  publish: (state: SavedFloatLoadState<T>) => void;
  onSuccess: (shortCode: string, plan: T) => void;
  errorMessage: (error: unknown) => string;
}) {
  const requests = createLatestRequest();
  let state = emptySavedFloatState<T>();
  let cancelDelay = () => {};
  const update = (next: SavedFloatLoadState<T>) => { state = next; publish(next); };
  return {
    async load(shortCode: string) {
      cancelDelay();
      const request = requests.start();
      let settled = false;
      const active = () => !settled && request.isCurrent();
      const previous = state.shortCode === shortCode ? state : emptySavedFloatState<T>();
      update({ ...previous, shortCode, loading: true, error: null });
      const timer = setTimeout(() => {
        if (active() && !state.plan) update({ ...state, showSaved: true });
      }, 1200);
      cancelDelay = () => clearTimeout(timer);
      // Reachability is only a hint: it can lag foreground/network changes.
      // Reveal logistics early without cancelling a request that may succeed.
      // Unknown connectivity uses the grace period; late hints cannot erase success.
      void isOffline().then(offline => {
        if (!offline || !active()) return;
        clearTimeout(timer);
        if (!state.plan) update({ ...state, showSaved: true });
      }).catch(() => {});
      try {
        const plan = await fetchPlan(shortCode, request.signal);
        if (!active()) return;
        settled = true;
        update({ shortCode, plan, loading: false, error: null, checkedAt: new Date().toISOString(), showSaved: false });
        onSuccess(shortCode, plan);
      } catch (error) {
        if (!active()) return;
        settled = true;
        update({ ...state, loading: false, error: errorMessage(error), showSaved: true });
      } finally {
        clearTimeout(timer);
      }
    },
    dispose() { cancelDelay(); requests.invalidate(); },
  };
}
