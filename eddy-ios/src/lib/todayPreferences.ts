// eddy-ios/src/lib/todayPreferences.ts
// What the Today tab opens with, remembered on this device.
//
// One key so far: whether Eddy's global update is folded shut. The card is the
// tallest thing on the screen — an otter, a headline and two or three sentences
// of prose, above the search field — and somebody who has read this morning's
// update, or who simply does not want it, was paying for it with a scroll on
// every launch.
//
// ── Device-local, like the map's layers, and for the same reasons ────────────
//
// This is a VIEW preference, not a fact about the water and not a claim about
// the account. It is also the sort of thing most likely to be toggled on the
// river with no signal. AsyncStorage, same as mapPreferences, the star store and
// the push opt-out.
//
// ── Collapsed is remembered; the update itself is not suppressed ─────────────
//
// Folding the card leaves the HEADLINE — "9 of 24 rivers are floatable right
// now" — on screen at full size. That count is the answer the tab is named for
// and it is never hidden by this; what folds is the paragraph about it. A
// preference that could hide the count would be a preference that empties the
// screen, and nobody would remember setting it.

export const TODAY_UPDATE_COLLAPSED_KEY = 'eddy.today.updateCollapsed.v1';

export interface TodayPreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): TodayPreferenceStorage {
  // Lazily required, like mapPreferences': this module is imported by the tab
  // expo-router loads at startup, and a native module resolved at import costs
  // the app its launch rather than costing this file its feature.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as TodayPreferenceStorage;
}

/**
 * Is the global update folded shut on this device?
 *
 * Anything unreadable answers `false` — open. A corrupt value must not hide
 * Eddy's writing, because an absent card looks like an outage rather than like a
 * setting, and the control that would undo it is inside the thing being hidden.
 */
export async function readUpdateCollapsed(
  storage: TodayPreferenceStorage = deviceStorage(),
): Promise<boolean> {
  try {
    return (await storage.getItem(TODAY_UPDATE_COLLAPSED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Remember the fold. Never throws — see mapPreferences' writer. */
export async function writeUpdateCollapsed(
  collapsed: boolean,
  storage: TodayPreferenceStorage = deviceStorage(),
): Promise<void> {
  try {
    await storage.setItem(TODAY_UPDATE_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Intentionally silent. A card that draws correctly and forgets its fold is
    // a smaller failure than a tab that stalls on a key-value write.
  }
}

// ── The fold, as two pure functions ─────────────────────────────────────────
//
// They live here rather than inline in TodaySummary because the app has no test
// runner of its own and a component cannot be exercised from the web suite. The
// state machine is four lines and it shipped INVERTED: the card computed
// `open = collapsed === false` and then wrote `!open` back as the next
// collapsed value — which is the state it was already in. Tapping the chevron
// changed nothing, in either direction, on every device, for every user. It
// looked like a dead control rather than like a bug, so nobody could report it
// as one.
//
// Two named functions with a test each is what stops that recurring. The
// component now holds no fold logic at all.

/**
 * Is the update showing?
 *
 * `collapsed` is `undefined` while the stored answer is still being read, and
 * that resolves to SHUT — see TodaySummary for why the card must not open and
 * then close under the reader's thumb. Nothing to show is also shut: a card
 * with no prose has nothing to open.
 */
export function isUpdateOpen(hasProse: boolean, collapsed: boolean | undefined): boolean {
  return hasProse && collapsed === false;
}

/**
 * What to store after a tap on the chevron.
 *
 * Takes the CURRENT open state and returns the next COLLAPSED value, which is
 * the same thing: a card that is open becomes collapsed, and vice versa. The
 * inversion is the whole content of the bug above, so it is named once, here.
 */
export function collapsedAfterToggle(open: boolean): boolean {
  return open;
}
