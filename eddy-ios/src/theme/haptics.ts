// eddy-ios/src/theme/haptics.ts
// The app's tactile vocabulary. Four named events, and nothing else.
//
// ── Why a module and not calls ──────────────────────────────────────────────
// Until now the app had no haptics at all: no dependency, no call sites. A
// map sheet that snapped to a detent in silence read as a web view, and a star
// or a bell that flipped under a wet thumb in sun glare gave no sign it had.
// The fix is not to sprinkle Haptics.* through a hundred components — it is a
// small vocabulary, so the same gesture feels the same everywhere and the whole
// language can be tuned, or muted, in one file.
//
// ── The four events ─────────────────────────────────────────────────────────
//   selection()  a choice among peers: a filter chip, a segment, a tab, a
//                pace, a layer switch. iOS's own selection tick.
//   settle()     something landed: the sheet on a detent, a put-in chosen.
//                One light impact, once per settle — never during a drag.
//   confirm()    a light impact for a state the user just set: star, bell,
//                swipe-to-remove. Says "done" without ceremony.
//   success() /  a write that mattered landed or failed: a plan saved, an
//   failure()    alert created; a destructive gesture that could not run.
//                iOS notification feedback. failure() is NEVER used for
//                ordinary validation — a field left empty is not an alarm.
//
// ── Guarded ─────────────────────────────────────────────────────────────────
// Every call is fire-and-forget and swallows its rejection. expo-haptics
// rejects on hardware without a Taptic Engine (older iPads, the simulator) and
// on Expo Go; a haptic must never be the reason a tap handler throws. iOS
// honours the system Haptics setting on its own, so there is nothing to check.
//
// Sits beside palette.ts and typography.ts because it is part of the same
// design system: what the app looks like, reads like, and feels like.

import * as Haptics from 'expo-haptics';

const quiet = (work: () => Promise<void>): void => {
  try {
    void work().catch(() => {});
  } catch {
    // A synchronous throw from a missing native module in some dev setups.
  }
};

/** A choice among peers — chip, segment, tab, pace, layer switch. */
export function selection(): void {
  quiet(() => Haptics.selectionAsync());
}

/** Something landed — the sheet on a detent, an endpoint chosen. */
export function settle(): void {
  quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A state the user just set — star, bell, swipe-to-remove. */
export function confirm(): void {
  quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A write that mattered landed — plan saved, alert created. */
export function success(): void {
  quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A destructive gesture that could not run. Not for ordinary validation. */
export function failure(): void {
  quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export const haptics = { selection, settle, confirm, success, failure } as const;
