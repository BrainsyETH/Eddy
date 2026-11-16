// src/lib/embed/display-events.ts
// The display contract (docs/embeds.md#display-contract): the messages a
// full-screen display embed posts to the page that frames it, so a host that
// rotates several displays on one wall can tell when one has loaded, whether
// its readings are current, and when it has reached a natural place to cut
// away. Pure, so hosts' expectations are tested here (display-events.test.ts).
//
// Messages are posted to the parent with target origin '*', like
// 'eddy-embed:resize': they carry nothing a viewer of the page could not
// already read off the screen.

export const DISPLAY_EVENT_VERSION = 1;

/** The displays that speak the contract. */
export type DisplayId = 'mills' | 'river-window' | 'board';
export type DisplayFormat = 'landscape' | 'vertical';

/** current: the last refresh succeeded. interrupted: it failed, the last good
 * readings are still on screen (and aging). unavailable: no readings at all. */
export type DisplayReadings = 'current' | 'interrupted' | 'unavailable';
export type DisplayScenery = 'ok' | 'unavailable';

export type DisplayEvent =
  /** Sent once, when the display is drawn and its first readings request has settled (either way). */
  | { type: 'eddy-display:ready'; v: 1; display: DisplayId; format: DisplayFormat }
  /** Sent whenever readings or scenery change, and once right after ready. */
  | { type: 'eddy-display:status'; v: 1; display: DisplayId; readings: DisplayReadings; scenery: DisplayScenery }
  /**
   * A natural place to cut away has just been reached. `completed` counts
   * breaks since the page loaded (1, 2, 3 …); `total` is how many breaks make
   * one full loop, so `completed % total === 0` means the loop is complete.
   * Displays that are paused (motion off) send none. `next`, when present,
   * is what the display shows next; Mills accepts it back as `?start=`, so a
   * host that cuts away here can resume the tour where it left off.
   */
  | { type: 'eddy-display:break'; v: 1; display: DisplayId; completed: number; total: number; next?: string };

export type DisplayEventType = DisplayEvent['type'];

/** Readings state from a react-query-shaped result. Pending → null (nothing to report yet). */
export function displayReadings(query: { isPending: boolean; isError: boolean; hasData: boolean }): DisplayReadings | null {
  if (query.isError) return query.hasData ? 'interrupted' : 'unavailable';
  if (query.isPending) return null;
  return query.hasData ? 'current' : 'unavailable';
}

const DISPLAYS: readonly DisplayId[] = ['mills', 'river-window', 'board'];
const READINGS: readonly DisplayReadings[] = ['current', 'interrupted', 'unavailable'];
const SCENERY: readonly DisplayScenery[] = ['ok', 'unavailable'];
const FORMATS: readonly DisplayFormat[] = ['landscape', 'vertical'];

/**
 * Whether a postMessage payload is a display-contract event. Hosts use this
 * (and must also check the message came from their own iframe). Unknown
 * versions are rejected so a future breaking change cannot be misread.
 */
export function isDisplayEvent(data: unknown): data is DisplayEvent {
  if (!data || typeof data !== 'object') return false;
  const e = data as Record<string, unknown>;
  if (e.v !== DISPLAY_EVENT_VERSION || !DISPLAYS.includes(e.display as DisplayId)) return false;
  switch (e.type) {
    case 'eddy-display:ready':
      return FORMATS.includes(e.format as DisplayFormat);
    case 'eddy-display:status':
      return READINGS.includes(e.readings as DisplayReadings) && SCENERY.includes(e.scenery as DisplayScenery);
    case 'eddy-display:break':
      return (
        Number.isInteger(e.completed) && (e.completed as number) > 0 &&
        Number.isInteger(e.total) && (e.total as number) > 0 &&
        (e.next === undefined || (typeof e.next === 'string' && e.next.length > 0))
      );
    default:
      return false;
  }
}

/** Posts to the framing page; a no-op when the display is not framed. */
export function postDisplayEvent(event: DisplayEvent): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(event, '*');
}
