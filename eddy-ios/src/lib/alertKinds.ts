// eddy-ios/src/lib/alertKinds.ts
// The three condition-alert options, and which conditions each one actually
// notifies about.
//
// Shared by the create and edit screens, which had the same three-option list
// written out twice. The list is not the interesting part — the CODES are.
//
// ── Where the mapping comes from, and why it is four and not six ────────────
//
// Read off the server's own sets rather than invented here:
// `missouri-float-planner/src/lib/alerts/event-kind.ts` defines
// FLOATABLE = {good, flowing} and ELEVATED = {high, dangerous}, classifyEventKind
// turns a transition into a kind from those, and subscriptionKindsFor() in
// fanout.ts routes each kind to the options that want it —
//   floatable → ['floatable', 'all']
//   warning, easing → ['safety', 'all']
//   recovery, info → nobody
//
// That last line is why "Everything" lists FOUR conditions. A river dropping to
// Low or Too low is a `recovery` or `info` event: recorded for the free feed,
// never pushed. Showing all six codes would promise notifications the engine
// will not send — which is exactly the class of bug that made `kind: 'floatable'`
// silently unable to deliver a danger alert.
//
// If event-kind.ts ever changes, this must follow.

import { CONDITION_ORDER, FLOATABLE_NOW } from '@eddy/conditions';
import type { AlertSubscriptionKind } from '@eddy/types';

/** Conditions that count as coming UP to floatable. Canonical set, not a copy. */
const FLOATABLE_CODES: string[] = CONDITION_ORDER.filter((code) => FLOATABLE_NOW.has(code));

/** Elevated water — the ones a `warning` or `easing` event lands on. */
const ELEVATED_CODES: string[] = ['high', 'dangerous'];

/** Sorted low → high, so the chips read as a ladder rather than a set. */
function ordered(codes: string[]): string[] {
  return CONDITION_ORDER.filter((code) => codes.includes(code));
}

const CODES_BY_KIND: Record<AlertSubscriptionKind, string[]> = {
  floatable: ordered(FLOATABLE_CODES),
  safety: ordered(ELEVATED_CODES),
  all: ordered([...FLOATABLE_CODES, ...ELEVATED_CODES]),
};

/** The conditions this option will actually notify about. */
export function codesForKind(kind: AlertSubscriptionKind): string[] {
  return CODES_BY_KIND[kind] ?? CODES_BY_KIND.all;
}

export interface AlertKindOption {
  value: AlertSubscriptionKind;
  label: string;
  hint: string;
}

/**
 * Ordered widest-first, so the default sits at the top where it is chosen
 * without reading the other two.
 */
export const CONDITION_KINDS: AlertKindOption[] = [
  { value: 'all', label: 'Everything', hint: 'Floatable news and safety warnings' },
  { value: 'floatable', label: 'Floatable', hint: 'Only when it comes up to floatable' },
  { value: 'safety', label: 'Safety', hint: 'Only high and dangerous water' },
];
