// shared/flood-alert-copy.ts
//
// How an active NWS flood alert is named on a gauge — quoted, ordered, dated.
//
// The Weather Service's own statement, relayed: Eddy adds no severity of its
// own and draws no conclusion about floating. What it does decide is ORDER (a
// warning before a watch before an advisory, because that is the order the
// NWS means them in) and the expiry line, in the Ozarks' calendar.
//
// Pure, inside shared/, so the iOS app can import it as
// `@eddy/conditions/flood-alert-copy` and the web suite can test it.

export interface FloodAlertLike {
  event: string;
  expires: string | null;
}

/**
 * Whether an alert is a WARNING — the NWS tier meaning flooding is happening
 * or imminent. The only tier a client should render with alarm weight.
 */
export function isFloodWarning(alert: Pick<FloodAlertLike, 'event'>): boolean {
  return /warning/i.test(alert.event);
}

function rank(event: string): number {
  if (/warning/i.test(event)) return 0;
  if (/watch/i.test(event)) return 1;
  if (/advisory/i.test(event)) return 2;
  return 3;
}

/**
 * Alerts to show, most serious first, at most `limit`, expired ones dropped.
 *
 * The same event can arrive more than once (overlapping zones issue their own
 * product), and two "Flood Warning" lines say nothing the first did not — so
 * one line per event, keeping the latest expiry.
 */
export function floodAlertsToShow<T extends FloodAlertLike>(
  alerts: readonly T[] | null | undefined,
  now: number = Date.now(),
  limit = 2,
): T[] {
  if (!alerts?.length) return [];
  const byEvent = new Map<string, T>();
  for (const alert of alerts) {
    const expires = alert.expires ? Date.parse(alert.expires) : NaN;
    if (Number.isFinite(expires) && expires <= now) continue;
    const held = byEvent.get(alert.event);
    const heldExpires = held?.expires ? Date.parse(held.expires) : NaN;
    if (!held || (Number.isFinite(expires) && (!Number.isFinite(heldExpires) || expires > heldExpires))) {
      byEvent.set(alert.event, alert);
    }
  }
  return [...byEvent.values()]
    .sort((a, b) => rank(a.event) - rank(b.event))
    .slice(0, limit);
}

/**
 * "Flood Warning in effect until Tuesday 7 PM".
 *
 * Central time, for the reason forecastDayLabel uses it. Without an expiry the
 * line is just the event — inventing an end time would be worse than none.
 */
export function floodAlertLine(alert: FloodAlertLike, now: number = Date.now()): string {
  const expires = alert.expires ? Date.parse(alert.expires) : NaN;
  if (!Number.isFinite(expires)) return `${alert.event} in effect`;
  const dayKey = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    .format(expires)
    .replace(':00', '');
  const day =
    dayKey(expires) === dayKey(now)
      ? 'today'
      : dayKey(expires) === dayKey(now + 86_400_000)
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(expires);
  return `${alert.event} in effect until ${day} ${time}`;
}
