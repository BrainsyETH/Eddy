import type { FloatPlan } from '@eddy/types';

type SavedLink = { shortCode: string; url: string };
type SavePlan = (plan: FloatPlan) => Promise<SavedLink>;
interface ActionState {
  saving: boolean;
  saveError: string | null;
  shareError: string | null;
}
const IDLE: ActionState = { saving: false, saveError: null, shareError: null };

/** Shown when a share went out without a link because one could not be created. */
export const SHARE_WITHOUT_LINK = 'Couldn’t create a link, so this share has the trip details only. Check your connection and share again to include it.';

/**
 * The trip in one line. A float time is included when there is one, and
 * regulated water keeps its standing note. A time withheld for today's water
 * is left out: said here it would reach the recipient undated
 * (missouri-float-planner/docs/SHARING_PREVIEWS.md).
 */
export function planShareSummary(plan: FloatPlan): string {
  const time = plan.floatTime?.formatted
    ?? (plan.floatTimeWithheldReason === 'regulated' ? 'time depends on dam releases' : null);
  return [`${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name}`, plan.distance.formatted, time]
    .filter(Boolean).join(' · ');
}

export function planShareMessage(plan: FloatPlan, url?: string): string {
  const summary = planShareSummary(plan);
  return url ? `${summary}\n${url}` : summary;
}

/** Request state outlives the modal's native content, just like the plan does. */
export function createPlanActions() {
  const states = new WeakMap<FloatPlan, ActionState>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let activeShare: object | null = null;
  // One link per plan: sharing the same plan again, or after saving it, reuses it.
  const links = new WeakMap<FloatPlan, SavedLink>();
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
        links.set(plan, saved);
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
      /** The link of the saved float this plan matches, when there is one. */
      savedLink?: SavedLink;
    }) {
      if (activeShare) return;
      const request = {};
      activeShare = request;
      update(plan, { shareError: null });
      try {
        let link = actions.savedLink ?? links.get(plan);
        if (!link) {
          try {
            link = await actions.savePlan(plan);
            links.set(plan, link);
          } catch {
            // Only a link-creation failure falls back to plain trip details.
          }
        }
        if (activeShare !== request) return;
        // Say so before the sheet covers it: the recipient is about to get no link.
        if (!link) update(plan, { shareError: SHARE_WITHOUT_LINK });
        await actions.present(planShareMessage(plan, link?.url));
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
