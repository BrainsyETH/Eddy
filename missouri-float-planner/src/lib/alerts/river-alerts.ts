// src/lib/alerts/river-alerts.ts
// Gathering closures and weather warnings for Eddy's rivers.
//
// ── Why this is a lib and not just the route ───────────────────────────────
// Two consumers need it: GET /api/river-alerts (the app) and the river hub page
// (server-rendered). A server component fetching its own API route would be an
// HTTP hop to localhost, a second cold start and a cache layer nobody asked
// for. Both call this instead.
//
// ── What it is NOT ─────────────────────────────────────────────────────────
// Not a sibling of /api/high-water. That is a snapshot of things EDDY grades,
// every row the output of a threshold ladder a human set. Everything here is
// somebody else's verdict — the Weather Service's, the Park Service's — quoted
// rather than computed. Mixing the two would put Eddy's name on claims Eddy did
// not make. See the note on RiverAlert in @eddy/types.
//
// ── Live, not synced ───────────────────────────────────────────────────────
// No table and no cron. Both upstreams are tiny at our scale — one call per
// active state (two) and one per park code (two) — and both are cached 15
// minutes at the fetch layer, so the fan-out is four requests per quarter hour
// no matter how many people are reading. A table would also have to be filled
// by a cron, and the existing NPS sync runs WEEKLY: a gate that closed on
// Friday would surface on Sunday. For closures that is the wrong trade.
//
// ── Failure is per-source, never total ─────────────────────────────────────
// The rule /api/high-water follows. An NPS outage, or simply no NPS_API_KEY in
// this environment, must not take the flood warnings down with it — and the
// reverse.

import type { RiverAlert, RiverAlertSeverity } from '@/types/api';
import { fetchNWSAlerts, filterAlertsForRiver, type NWSAlert } from '@/lib/nws/alerts';
import { fetchNPSAlerts } from '@/lib/nps/client';
import { getActiveRiverContexts, type RiverContext } from '@/lib/rivers/context';

/**
 * NWS severity/urgency → our three levels.
 *
 * The NWS ships `severity` (Extreme/Severe/Moderate/Minor/Unknown) and, on top
 * of it, an event name whose last word is the real signal every weather app
 * keys on: a "Warning" is happening, a "Watch" might, an "Advisory" is a
 * nuisance. The event name wins here because it is the distinction users
 * already know, and severity is used only to promote a Warning that the NWS
 * itself has flagged as Extreme or Severe.
 */
export function nwsSeverity(alert: NWSAlert): RiverAlertSeverity {
  const event = alert.event.toLowerCase();
  if (event.includes('warning')) return 'warning';
  if (event.includes('watch')) return 'watch';
  // Advisories and Hydrologic Outlooks. An Outlook is explicitly a "this could
  // develop in coming days" — the mildest thing the NWS publishes about water.
  return 'notice';
}

/**
 * NPS category → our three levels.
 *
 * The NPS documents four categories and ships others, so this maps only what it
 * recognises and floors everything else at `notice`. That direction is the
 * whole point: an unrecognised string turned into a warning is a park
 * newsletter rendered as a hazard, and the failure is silent because nobody
 * reviews a category they have never seen.
 */
export function npsSeverity(category: string): RiverAlertSeverity {
  switch (category.trim().toLowerCase()) {
    case 'danger':
      return 'warning';
    case 'closure':
      // Not a danger — a closure is a fact about a gate, not about the water.
      // It still outranks a notice, because it changes whether the trip happens.
      return 'watch';
    case 'caution':
      return 'watch';
    default:
      return 'notice';
  }
}

/** NWS alerts for every active river, matched by that river's own search terms. */
async function weatherAlerts(rivers: RiverContext[]): Promise<RiverAlert[]> {
  const states = [...new Set(rivers.map((r) => r.state).filter(Boolean))];

  // One request per state, not per river — a dozen Missouri rivers share one
  // answer, and it is cached anyway.
  const byState = new Map<string, NWSAlert[]>();
  await Promise.all(
    states.map(async (state) => {
      byState.set(state, await fetchNWSAlerts(state).catch(() => []));
    }),
  );

  return matchWeatherAlerts(rivers, byState);
}

/**
 * The matching half of the above, with the network taken out.
 *
 * Exported so the rules below can be tested against fixtures rather than
 * against whatever the sky is doing — the severity mapping and the fail-closed
 * rule are both safety-relevant, and neither should be verifiable only on a day
 * when Missouri happens to be flooding.
 */
export function matchWeatherAlerts(
  rivers: Pick<RiverContext, 'slug' | 'name' | 'state' | 'alertSearchTerms'>[],
  byState: Map<string, NWSAlert[]>,
): RiverAlert[] {
  const out: RiverAlert[] = [];
  for (const river of rivers) {
    // ── Fail CLOSED on a river with no search terms ────────────────────────
    // filterAlertsForRiver returns EVERY alert in the state when a river has no
    // terms ("Return all if no specific terms"). That is defensible where it
    // feeds a prompt, and indefensible on a screen: a newly ingested river
    // would show every flood warning in Missouri as though they were its own.
    // Skipping is the safe direction — the section is absent rather than wrong
    // — and it is done HERE rather than by changing the shared helper, so the
    // two LLM callers keep the behaviour they were written against.
    if (!river.alertSearchTerms?.length) continue;

    const stateAlerts = byState.get(river.state) ?? [];
    for (const alert of filterAlertsForRiver(stateAlerts, river.slug, river.alertSearchTerms)) {
      out.push({
        // The same NWS alert legitimately matches several rivers, and each is
        // its own row — so the river has to be in the key or React sees one.
        id: `nws:${river.slug}:${alert.id}`,
        source: 'nws',
        severity: nwsSeverity(alert),
        riverSlug: river.slug,
        riverName: river.name,
        // The headline is a full sentence in the NWS's own voice; the event is
        // the two-word label. Prefer the headline, fall back to the label.
        title: alert.headline || alert.event,
        body: alert.description,
        category: alert.event,
        startsAt: alert.onset || null,
        endsAt: alert.expires || null,
        // weather.gov has no stable per-alert public page worth linking; the id
        // is an API URN, not a URL a person can open.
        url: null,
      });
    }
  }
  return out;
}

/** NPS alerts for the rivers that sit inside a park. */
async function parkAlerts(rivers: RiverContext[]): Promise<RiverAlert[]> {
  const withPark = rivers.filter((r) => r.parkCode);
  const parkCodes = [...new Set(withPark.map((r) => r.parkCode as string))];
  if (parkCodes.length === 0) return [];

  const byPark = new Map<string, Awaited<ReturnType<typeof fetchNPSAlerts>>>();
  await Promise.all(
    parkCodes.map(async (code) => {
      byPark.set(code, await fetchNPSAlerts(code));
    }),
  );

  const out: RiverAlert[] = [];
  for (const river of withPark) {
    for (const alert of byPark.get(river.parkCode as string) ?? []) {
      out.push({
        // Ozark NSR covers the Current AND the Jacks Fork, so one park alert
        // becomes two rows. Same keying reason as the weather side.
        id: `nps:${river.slug}:${alert.id}`,
        source: 'nps',
        severity: npsSeverity(alert.category),
        riverSlug: river.slug,
        riverName: river.name,
        title: alert.title,
        body: alert.description ?? '',
        category: alert.category,
        // The NPS publishes no onset or expiry — an alert is up until it is
        // taken down. Null rather than inventing a window from lastIndexedDate,
        // which is an edit timestamp and would read as "in effect from".
        startsAt: null,
        endsAt: null,
        url: alert.url || null,
      });
    }
  }
  return out;
}

/** Loudest first, then by river, so one river's rows stay together. */
const SEVERITY_RANK: Record<RiverAlertSeverity, number> = { warning: 0, watch: 1, notice: 2 };

/**
 * Every posted alert for the active rivers, or for one of them.
 *
 * Narrowing happens BEFORE the fan-out, not after: a river page asking about
 * the Niangua should not cost a Park Service round trip for the Buffalo.
 *
 * Never throws. Both halves catch independently and an empty array is a
 * legitimate answer — which is exactly why RIVER_ALERT_SOURCE_NOTE exists, so
 * a surface can say that empty does not mean all-clear.
 */
export async function getRiverAlerts(riverSlug?: string): Promise<RiverAlert[]> {
  const all = await getActiveRiverContexts();
  const rivers = riverSlug ? all.filter((r) => r.slug === riverSlug) : all;
  if (rivers.length === 0) return [];

  const [weather, parks] = await Promise.all([
    weatherAlerts(rivers).catch((err) => {
      console.error('[river-alerts] NWS failed:', err);
      return [] as RiverAlert[];
    }),
    parkAlerts(rivers).catch((err) => {
      console.error('[river-alerts] NPS failed:', err);
      return [] as RiverAlert[];
    }),
  ]);

  return [...weather, ...parks].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.riverName.localeCompare(b.riverName) ||
      a.title.localeCompare(b.title),
  );
}
