import type { FloatPlan } from '@eddy/types';

type SavedLink = { shortCode: string; url: string };
type SavePlan = (plan: FloatPlan) => Promise<SavedLink>;
interface ActionState {
  saving: boolean;
  saveError: string | null;
  shareError: string | null;
}
const IDLE: ActionState = { saving: false, saveError: null, shareError: null };

export function planShareMessage(plan: FloatPlan, url?: string): string {
  const time = plan.floatTime?.formatted ?? (plan.floatTimeWithheldReason === 'regulated'
    ? 'time depends on dam releases' : 'no estimate in this water');
  const summary = `${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name} · ${plan.distance.formatted} · ${time}`;
  return url ? `${summary}\n${url}` : summary;
}

/** Request state outlives the modal's native content, just like the plan does. */
export function createPlanActions() {
  const states = new WeakMap<FloatPlan, ActionState>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let activeShare: object | null = null;
  const notify = () => { revision += 1; listeners.forEach((listener) => listener()); };
  const stateFor = (plan: FloatPlan) => states.get(plan) ?? IDLE;
  const update = (plan: FloatPlan, patch: Partial<ActionState>) => {
    states.set(plan, { ...stateFor(plan), ...patch });
    notify();
  };

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => revision,
    stateFor,
    isSharing: () => activeShare !== null,
    // A late link must not present a share sheet over a closed/changed planner.
    cancelShare() { if (activeShare) { activeShare = null; notify(); } },
    async toggleSave(plan: FloatPlan, actions: {
      isSaved: (plan: FloatPlan) => boolean;
      forgetPlan: (plan: FloatPlan) => void;
      savePlan: SavePlan;
      remember: (plan: FloatPlan, saved: SavedLink) => void;
    }) {
      // Synchronous guard: two taps can arrive before React disables a button.
      if (stateFor(plan).saving) return;
      update(plan, { saveError: null });
      if (actions.isSaved(plan)) { actions.forgetPlan(plan); return 'removed' as const; }
      update(plan, { saving: true });
      try {
        const saved = await actions.savePlan(plan);
        actions.remember(plan, saved);
        return 'saved' as const;
      } catch {
        update(plan, { saveError: 'Could not save this float. Check your connection and try again.' });
      } finally {
        update(plan, { saving: false });
      }
    },
    async share(plan: FloatPlan, actions: {
      savePlan: SavePlan;
      present: (message: string) => Promise<unknown>;
    }) {
      if (activeShare) return;
      const request = {};
      activeShare = request;
      update(plan, { shareError: null });
      try {
        let url: string | undefined;
        try {
          url = (await actions.savePlan(plan)).url;
        } catch {
          // Only a link-creation failure falls back to plain trip details.
        }
        if (activeShare !== request) return;
        await actions.present(planShareMessage(plan, url));
      } catch {
        // Dismissing the native dialog resolves normally. A presentation error
        // is shown once, never followed by a second automatic share dialog.
        if (activeShare === request) update(plan, { shareError: 'Could not open sharing. Please try again.' });
      } finally {
        if (activeShare === request) { activeShare = null; notify(); }
      }
    },
  };
}
