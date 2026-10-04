import type { PlanDetailDestination } from './planDestinations';

/** A native Modal must finish dismissing before the underlying stack can push. */
export function createPlanDetailNavigation() {
  let suspended = false;
  let pending: PlanDetailDestination | null = null;
  let leftScreen = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const reset = () => {
    pending = null;
    leftScreen = false;
    if (suspended) { suspended = false; notify(); }
  };

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => suspended,
    open(destination: PlanDetailDestination) {
      if (suspended) return; // Includes a second tap before React renders.
      pending = destination;
      suspended = true;
      notify();
    },
    dismissed() {
      const destination = pending;
      pending = null; // Native callbacks may repeat; push at most once.
      return destination;
    },
    focus(focused: boolean) {
      if (!suspended || pending) return;
      if (!focused) leftScreen = true;
      else if (leftScreen) reset();
    },
    reset,
  };
}
