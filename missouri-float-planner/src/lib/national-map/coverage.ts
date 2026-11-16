// src/lib/national-map/coverage.ts
// The national map's state coverage report: for every state, what exists, what
// is current, and what can be compared — so "missing capability" (a state with
// few NWS flood thresholds) is never confused with "missing ingestion" (a
// state whose stations stopped arriving).
//
// Pure. scripts/audit-national-coverage.ts loads the rows and prints this.

import { US_REGIONS } from '@/lib/usgs/national-sites';
import { componentOf } from './projection';
import { NATIONAL_STATE_CODES } from './scope';
import type { LatestInput, NwsInput } from './frame';
import type { NationalStation } from './station-source';

const H = 3_600_000;

export interface StateCoverage {
  state: string;
  stations: number;
  withLatest: number;
  freshDischarge: number;
  freshStage: number;
  /** Fresh, unflagged, and carrying a seasonal percentile. */
  compared: number;
  dormant: number;
  nwsPoints: number;
  nwsMatched: number;
  nwsWithThreshold: number;
}

export interface CoverageReport {
  generatedAt: string;
  states: StateCoverage[];
  /** Stations with no state code (DC, border sites), reported, never dropped. */
  unassigned: StateCoverage;
  /** Active stations near a regional fetch seam that hold no latest reading. */
  seamGaps: Array<{ siteId: string; lng: number; lat: number }>;
  aleutiansEastOfAntimeridian: { stations: number; withLatest: number };
  /** States with stations but no current readings at all — an ingestion signal. */
  silentStates: string[];
}

function empty(state: string): StateCoverage {
  return { state, stations: 0, withLatest: 0, freshDischarge: 0, freshStage: 0, compared: 0, dormant: 0, nwsPoints: 0, nwsMatched: 0, nwsWithThreshold: 0 };
}

/** Distance in degrees to the nearest edge of any regional fetch box. */
function seamDistance(lng: number, lat: number): number {
  let best = Infinity;
  for (const { bbox } of US_REGIONS) {
    const [w, s, e, n] = bbox;
    if (lng < w - 0.5 || lng > e + 0.5 || lat < s - 0.5 || lat > n + 0.5) continue;
    best = Math.min(best, Math.abs(lng - w), Math.abs(lng - e), Math.abs(lat - s), Math.abs(lat - n));
  }
  return best;
}

export function buildCoverageReport(args: {
  stations: NationalStation[];
  latest: LatestInput[];
  nws: NwsInput[];
  nwsStates: Map<string, string>;
  now: number;
}): CoverageReport {
  const { stations, latest, nws, nwsStates, now } = args;
  const rows = new Map<string, StateCoverage>(NATIONAL_STATE_CODES.map((c) => [c, empty(c)]));
  const unassigned = empty('—');
  const latestBySite = new Map(latest.map((l) => [l.siteId, l]));
  const siteState = new Map<string, string | null>();
  const seamGaps: CoverageReport['seamGaps'] = [];
  const aleutians = { stations: 0, withLatest: 0 };

  for (const s of stations) {
    const row = (s.stateCode && rows.get(s.stateCode)) || unassigned;
    siteState.set(s.siteId, s.stateCode);
    row.stations++;
    const l = latestBySite.get(s.siteId);
    if (s.lng > 165 && componentOf(s.lng, s.lat) === 'ak') {
      aleutians.stations++;
      if (l) aleutians.withLatest++;
    }
    if (!l) {
      if (seamDistance(s.lng, s.lat) < 0.25) seamGaps.push({ siteId: s.siteId, lng: s.lng, lat: s.lat });
      continue;
    }
    row.withLatest++;
    const t = l.readingTimestamp ? Date.parse(l.readingTimestamp) : NaN;
    const age = Number.isFinite(t) ? now - t : Infinity;
    if (age > 30 * 24 * H) row.dormant++;
    if (age <= 6 * H && l.dischargeCfs !== null) row.freshDischarge++;
    if (age <= 6 * H && l.gaugeHeightFt !== null) row.freshStage++;
    if (age <= 6 * H && !l.suspect && l.flowPercentile !== null) row.compared++;
  }

  const lidToSite = new Map(stations.filter((s) => s.nwsLid).map((s) => [s.nwsLid!, s.siteId]));
  for (const p of nws) {
    const code = nwsStates.get(p.lid) ?? null;
    const row = (code && rows.get(code)) || unassigned;
    row.nwsPoints++;
    if (lidToSite.has(p.lid)) row.nwsMatched++;
    if (p.observed !== 'not_defined' && p.observed !== 'unknown') row.nwsWithThreshold++;
  }

  const states = [...rows.values()];
  return {
    generatedAt: new Date(now).toISOString(),
    states,
    unassigned,
    seamGaps,
    aleutiansEastOfAntimeridian: aleutians,
    silentStates: states.filter((r) => r.stations > 0 && r.freshDischarge + r.freshStage === 0).map((r) => r.state),
  };
}

export function coverageMarkdown(r: CoverageReport): string {
  const head =
    '| State | Stations | Latest row | Fresh discharge | Fresh stage | Compared | Dormant 30d+ | NWS points | NWS matched | NWS with threshold |\n' +
    '| - | -: | -: | -: | -: | -: | -: | -: | -: | -: |\n';
  const line = (s: StateCoverage) =>
    `| ${s.state} | ${s.stations} | ${s.withLatest} | ${s.freshDischarge} | ${s.freshStage} | ${s.compared} | ${s.dormant} | ${s.nwsPoints} | ${s.nwsMatched} | ${s.nwsWithThreshold} |`;
  const total = r.states.concat(r.unassigned).reduce(
    (a, s) => {
      for (const k of Object.keys(a) as Array<keyof Omit<StateCoverage, 'state'>>) a[k] += s[k];
      return a;
    },
    { ...empty('Total') } as StateCoverage,
  );
  return [
    `# National map coverage — ${r.generatedAt}`,
    '',
    'Fresh = observed within 6 hours. Compared = fresh, unflagged, with a seasonal percentile.',
    'Territories are out of scope by product decision and are not counted.',
    '',
    head + [...r.states, r.unassigned, total].map(line).join('\n'),
    '',
    `Silent states (stations, no fresh readings): ${r.silentStates.length ? r.silentStates.join(', ') : 'none'}`,
    `Stations near a regional fetch seam with no latest row: ${r.seamGaps.length}${r.seamGaps.length ? ` (${r.seamGaps.slice(0, 20).map((g) => g.siteId).join(', ')}${r.seamGaps.length > 20 ? ', …' : ''})` : ''}`,
    `Aleutian stations east of the antimeridian: ${r.aleutiansEastOfAntimeridian.stations} (${r.aleutiansEastOfAntimeridian.withLatest} with a latest row)`,
    '',
  ].join('\n');
}
