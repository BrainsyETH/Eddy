// src/lib/trust/checks/usgs-site-drift.ts
// The first check that asks a SOURCE what is true, instead of asking Eddy.
//
// ── Why this is the gap it is ────────────────────────────────────────────
//
// Every other check in the registry reads Eddy's own database or its own
// repository. Not one makes an outbound call. That makes the observer very good
// at internal consistency and structurally blind to the outside world: if USGS
// changes something and our copy does not, the database stays perfectly
// self-consistent and the ledger reports an all-clear. See
// docs/TRUST_MODEL_REVIEW_2026-08-10.md.
//
// The blindness is not theoretical here, because nothing refreshes this data on
// a schedule. gauge_stations metadata is written by scripts/import-usgs-gauges.ts
// — a manual script, not a cron. The scheduled jobs that touch gauges
// (update-gauges, sync-gauge-latest) write READINGS. So a station that USGS
// renames, relocates, re-surveys or decommissions keeps its original row until
// somebody happens to re-run an import by hand.
//
// ── A station's death is not its absence ────────────────────────────────
//
// The first version of this check read "no monitoring-location record" as
// "decommissioned". That is wrong, and it would have made the headline rule
// almost completely silent.
//
// USGS KEEPS the location record after telemetry ends. Verified against three
// stations this repository has already buried — 06928900, 07014100 and
// 05497485, all deactivated by 00153, and 00077's own header states that
// 07014100 "exists as a USGS monitoring location but has no data". Every one
// still returns a full record today. A check keyed on absence would have waited
// for stale_gauge to fire and contributed nothing.
//
// So there are two rules, because there are two facts:
//
//   usgs_site_unknown         USGS has no record of this identifier at all.
//                             Not a decommission — a wrong or retired id.
//   usgs_site_record_ended    USGS publishes no current discharge or gage-height
//                             series for this station. This is the death.
//
// The second reads `end` from time-series-metadata, which is where period of
// record actually lives.
//
// ── What this adds over stale_gauge, stated honestly ────────────────────
//
// Not earlier warning. stale_gauge fires after 24 hours of silence and this
// waits for a fortnight, so stale_gauge is first and will stay first.
//
// What this adds is the DIFFERENCE BETWEEN TRANSIENT AND PERMANENT. A silent
// gauge is a sensor glitch, a comms outage, or a station that is never coming
// back, and stale_gauge cannot tell those apart — it reports silence. When both
// are open on one station, the answer is not "wait": the river needs a new
// primary gauge. That is the operator-facing decision this rule exists to
// support, and it is why the two are not duplicates.
//
// ── Why both are high and not critical ──────────────────────────────────
//
// Severity is by consequence at the surface, and the surface consequence of a
// dead station is a stale badge — which stale_gauge already owns and already
// rates critical. Two criticals about one condition would double-count it in
// every gate that counts them.

import { haversineMiles } from '@/lib/rivers/filters';
import type { NationalSiteMeta } from '@/lib/usgs/national-sites';
import { fetchSiteRecordEnds, fetchSitesByIds } from '@/lib/usgs/national-sites';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

/** What Eddy stores about a station, narrowed to the fields USGS also publishes. */
export interface StoredSite {
  siteId: string;
  name: string;
  lng: number;
  lat: number;
  drainageAreaSqMi: number | null;
  /** Rivers this station is wired to, for the operator reading the finding. */
  riverSlugs: string[];
  /** Rivers it is the PRIMARY gauge for. Empty means it is a secondary. */
  primaryForSlugs: string[];
}

/**
 * How far a station may move before it is worth a finding.
 *
 * USGS re-surveys stations and publishes the improved coordinate, so small
 * changes are the source getting more accurate rather than anything being
 * wrong. 100 m is above that noise and well below the 1 km radius
 * river_geometry uses for "is there a gauge near this river", so a move this
 * check reports cannot silently break that one first.
 */
export const MOVE_TOLERANCE_METERS = 100;

/**
 * How much drainage area may differ before it is worth a finding.
 *
 * Relative, because the corpus runs from 8 sq mi headwater creeks to the 3,788
 * sq mi Meramec and a fixed threshold would be either meaningless at the top or
 * permanently noisy at the bottom. One percent is comfortably above the
 * rounding USGS publishes at and below any real re-delineation.
 */
export const DRAINAGE_TOLERANCE_FRACTION = 0.01;

/**
 * How long a station's published record may have been over before it counts as
 * ended.
 *
 * Not a race with stale_gauge, which fires after 24 hours and will always be
 * first. This answers a different question — is the station coming back — and
 * that question needs a window long enough to survive a routine multi-day
 * outage, a seasonal service visit, and whatever lag USGS has between the last
 * reading and the metadata that describes it. A fortnight clears all three, and
 * a station whose discharge record has been over for two weeks is not
 * experiencing a glitch.
 */
export const RECORD_STALE_DAYS = 14;

/**
 * Above this share of the examined scope, a mass `usgs_site_record_ended` is
 * treated as a broken answer rather than a true one.
 *
 * The same shape as reconcile.ts's mass_resolve guard, and the same argument
 * with the sign flipped: a sudden all-clear is a claim that has to be earned,
 * and so is a sudden mass failure. Every station in scope is wired to an active
 * river and was live at the last import; more than half of them going dark
 * between two daily runs is not something that happens to rivers, it is
 * something that happens to responses.
 *
 * This is deliberately a SECOND guard. classifyBatchResponse() already refuses
 * an empty, saturated or unmatched response, which covers the all-or-nothing
 * failures. What it cannot see is a filter that half-works — a response that
 * looks structurally fine and is silently missing most of its rows. This
 * catches that, and it catches whatever the next unanticipated shape turns out
 * to be, because it keys on the implausibility of the CONCLUSION rather than on
 * any property of the response.
 */
export const MASS_RECORD_ENDED_SHARE = 0.5;

/**
 * Below this many findings, the share is not meaningful.
 *
 * Mirrors mass_resolve's absolute floor for the same reason: on a small scope a
 * majority is one or two stations, and two genuinely decommissioned gauges must
 * still be reportable.
 */
export const MASS_RECORD_ENDED_FLOOR = 5;

const METERS_PER_MILE = 1609.344;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Names are compared loosely on purpose.
 *
 * USGS publishes the same station as "Huzzah Creek near Steelville, MO" in one
 * region and "COYLE BRANCH AT HOUSTON, MO." in another, and import-usgs-gauges
 * deliberately stores whatever it was given rather than title-casing it. A
 * case-sensitive comparison would file a rename finding for every station whose
 * capitalisation happens to differ from the day it was imported, which is a
 * list nobody reads twice.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function metersApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b) * METERS_PER_MILE;
}

function describeWiring(site: StoredSite): string {
  if (site.primaryForSlugs.length > 0) {
    return `primary gauge for ${site.primaryForSlugs.join(', ')}`;
  }
  if (site.riverSlugs.length > 0) {
    return `secondary gauge on ${site.riverSlugs.join(', ')}`;
  }
  return 'not wired to a river';
}

export interface DriftInput {
  stored: StoredSite[];
  source: Map<string, NationalSiteMeta>;
  /** Site ids nothing was learned about. Never reported as unknown. */
  unreached: Set<string>;
  /**
   * Newest published series end per site, from time-series-metadata.
   *
   * A site PRESENT with `null` publishes no discharge or gage-height series at
   * all. A site ABSENT from the map was not asked or the answer did not come
   * back — the same distinction `unreached` makes for the other collection, and
   * it matters for the same reason: an absent entry must never be read as a
   * record that ended.
   */
  recordEnds: Map<string, Date | null>;
  /** When the check ran. Passed in so the rule is pure and testable. */
  now: Date;
}

/**
 * Pure. Everything this check decides, with no I/O.
 *
 * Mirrors the split the rest of the registry uses (reconcile.ts states the rule:
 * the policy lives where it can be tested without a database), and it matters
 * more here than elsewhere — this is the one check whose input comes off the
 * network, so it is the one whose comparisons would otherwise be untestable
 * without either mocking fetch or hitting USGS in CI.
 */
export function deriveSiteDriftFindings(input: DriftInput): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const site of input.stored) {
    if (input.unreached.has(site.siteId)) continue;

    const remote = input.source.get(site.siteId);
    const wiring = describeWiring(site);

    if (!remote) {
      findings.push({
        entityType: 'gauge',
        entityKey: site.siteId,
        ruleKey: 'usgs_site_unknown',
        title: `USGS has no monitoring location numbered ${site.siteId}`,
        detail:
          `${site.name} (${wiring}) is stored as an active USGS station, but ` +
          `USGS-${site.siteId} returns no record from the monitoring-locations ` +
          `collection. This is a wrong or retired identifier rather than a ` +
          `decommission — USGS keeps the location record after telemetry ends, so ` +
          `a station that merely stopped reporting would still be found here. ` +
          `Nothing will ever read from this id.`,
        evidence: {
          siteId: site.siteId,
          storedName: site.name,
          riverSlugs: site.riverSlugs,
          primaryForSlugs: site.primaryForSlugs,
        },
      });
      continue;
    }

    // ── has the published record ended? ──────────────────────────────
    //
    // `has` rather than a truthy check: an entry present and null means USGS
    // publishes no discharge or gage-height series for this station, which is
    // the finding. An entry MISSING means nothing was learned, which is not.
    if (input.recordEnds.has(site.siteId)) {
      const end = input.recordEnds.get(site.siteId) ?? null;
      const daysSince =
        end === null ? null : Math.floor((input.now.getTime() - end.getTime()) / MS_PER_DAY);

      if (end === null || (daysSince !== null && daysSince > RECORD_STALE_DAYS)) {
        findings.push({
          entityType: 'gauge',
          entityKey: site.siteId,
          ruleKey: 'usgs_site_record_ended',
          title:
            end === null
              ? `USGS publishes no flow or stage record for site ${site.siteId}`
              : `USGS stopped publishing site ${site.siteId} ${daysSince} days ago`,
          detail:
            (end === null
              ? `${site.name} (${wiring}) has no discharge (00060) or gage-height ` +
                `(00065) time series in USGS's record at all.`
              : `${site.name} (${wiring}) last published on ` +
                `${end.toISOString().slice(0, 10)}, ${daysSince} days ago.`) +
            ` The station is still listed by USGS, so this is the record ending ` +
            `rather than a bad id. stale_gauge reports the silence within a day; ` +
            `what this adds is that the silence is permanent — the river needs a ` +
            `different primary gauge rather than a wait.`,
          evidence: {
            siteId: site.siteId,
            lastPublishedAt: end === null ? null : end.toISOString(),
            daysSincePublished: daysSince,
            primaryForSlugs: site.primaryForSlugs,
            thresholdDays: RECORD_STALE_DAYS,
          },
        });
      }
    }

    if (remote.lat !== null && remote.lng !== null) {
      const moved = metersApart(
        { lat: site.lat, lng: site.lng },
        { lat: remote.lat, lng: remote.lng },
      );
      if (moved > MOVE_TOLERANCE_METERS) {
        findings.push({
          entityType: 'gauge',
          entityKey: site.siteId,
          ruleKey: 'usgs_site_moved',
          title: `USGS site ${site.siteId} has moved ${Math.round(moved)} m from where Eddy has it`,
          detail:
            `${site.name} (${wiring}) is stored at ${site.lat.toFixed(5)}, ` +
            `${site.lng.toFixed(5)}; USGS now publishes ${remote.lat.toFixed(5)}, ` +
            `${remote.lng.toFixed(5)}. Above ${MOVE_TOLERANCE_METERS} m this is a ` +
            `relocation or a re-survey rather than rounding.`,
          evidence: {
            siteId: site.siteId,
            metersMoved: Math.round(moved),
            stored: { lat: site.lat, lng: site.lng },
            usgs: { lat: remote.lat, lng: remote.lng },
          },
        });
      }
    }

    if (remote.name && normalizeName(remote.name) !== normalizeName(site.name)) {
      findings.push({
        entityType: 'gauge',
        entityKey: site.siteId,
        ruleKey: 'usgs_site_renamed',
        title: `USGS renamed site ${site.siteId}`,
        detail:
          `Eddy stores "${site.name}"; USGS now publishes "${remote.name}" ` +
          `(${wiring}). A rename is often cosmetic, but it is also how a station ` +
          `re-designation first shows up.`,
        evidence: { siteId: site.siteId, storedName: site.name, usgsName: remote.name },
      });
    }

    // Only compared when BOTH sides have a number. USGS publishes no drainage
    // area for some stations, and a null there is missing data rather than a
    // change — reporting it would be this check complaining that a source did
    // not answer a question, which is not drift.
    if (site.drainageAreaSqMi !== null && remote.drainageAreaSqMi !== null) {
      const stored = site.drainageAreaSqMi;
      const published = remote.drainageAreaSqMi;
      const denominator = Math.max(Math.abs(stored), Math.abs(published));
      const relative = denominator === 0 ? 0 : Math.abs(stored - published) / denominator;
      if (relative > DRAINAGE_TOLERANCE_FRACTION) {
        findings.push({
          entityType: 'gauge',
          entityKey: site.siteId,
          ruleKey: 'usgs_site_drainage_changed',
          title: `USGS drainage area for site ${site.siteId} disagrees with Eddy's`,
          detail:
            `Eddy stores ${stored} sq mi; USGS publishes ${published} sq mi ` +
            `(${(relative * 100).toFixed(1)}% apart, ${wiring}). Drainage area is ` +
            `the scaling input for estimating flow at an ungauged reach.`,
          evidence: {
            siteId: site.siteId,
            storedSqMi: stored,
            usgsSqMi: published,
            relativeDifference: Number(relative.toFixed(4)),
          },
        });
      }
    }
  }

  return findings;
}

/** Row shape returned by the scope query. */
interface StationRow {
  usgs_site_id: string | null;
  name: string | null;
  drainage_area_sqmi: number | string | null;
  lng: number | string | null;
  lat: number | string | null;
  river_slug: string | null;
  is_primary: boolean | null;
}

function toNumber(raw: number | string | null): number | null {
  if (raw === null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Folds the join into one row per station.
 *
 * The scope query returns a row per station-river link, so a station on two
 * rivers arrives twice. Exported for the test: the folding is where a station
 * would silently be counted twice in scopeCount, which is the number
 * reconciliation trusts when deciding whether the check saw anything.
 */
export function foldStationRows(rows: StationRow[]): StoredSite[] {
  const bySite = new Map<string, StoredSite>();

  for (const row of rows) {
    const siteId = row.usgs_site_id;
    const lng = toNumber(row.lng);
    const lat = toNumber(row.lat);
    // No id or no coordinates means there is nothing to compare against the
    // source. validate_river_data owns "this gauge has no site id"
    // (gauge_missing_site_id); repeating it here would raise two findings about
    // one defect under two fingerprints.
    if (!siteId || lng === null || lat === null) continue;

    let site = bySite.get(siteId);
    if (!site) {
      site = {
        siteId,
        name: row.name ?? siteId,
        lng,
        lat,
        drainageAreaSqMi: toNumber(row.drainage_area_sqmi),
        riverSlugs: [],
        primaryForSlugs: [],
      };
      bySite.set(siteId, site);
    }

    if (row.river_slug && !site.riverSlugs.includes(row.river_slug)) {
      site.riverSlugs.push(row.river_slug);
    }
    if (row.is_primary && row.river_slug && !site.primaryForSlugs.includes(row.river_slug)) {
      site.primaryForSlugs.push(row.river_slug);
    }
  }

  for (const site of bySite.values()) {
    site.riverSlugs.sort();
    site.primaryForSlugs.sort();
  }

  return [...bySite.values()].sort((a, b) => a.siteId.localeCompare(b.siteId));
}

export const usgsSiteDriftCheck: TrustCheck = {
  id: 'usgs_site_drift',
  title: 'USGS station metadata still matches what Eddy stores',
  // Daily. USGS station metadata changes on the order of years, and the check
  // spends an outbound request budget that hourly would multiply by 24 for no
  // additional detection.
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    // Scoped to stations wired to ACTIVE rivers. gauge_stations holds ~14,300
    // USGS rows nationally, almost all of them imported for the statewide map
    // and carrying no Eddy judgement; checking those would spend 286 requests a
    // day to raise findings about stations no float plan depends on. The wired
    // set is ~44.
    const { data, error } = await ctx.supabase.rpc('trust_usgs_site_scope');

    // A read error aborts rather than degrading to an empty scope. An empty
    // scope would be recorded as a run that examined nothing, which is correct
    // but less informative than saying the query failed — and db.ts exists
    // because reading only `data` is how a missing FUNCTION became
    // indistinguishable from "no rows" on this subsystem's first day.
    if (error) {
      throw new Error(`could not read the USGS site scope: ${error.message ?? 'unknown error'}`);
    }

    const stored = foldStationRows((data ?? []) as StationRow[]);
    if (stored.length === 0) {
      // Reconciliation refuses to resolve on a zero scope, so this returns
      // rather than calling USGS with an empty batch.
      return { scopeCount: 0, findings: [] };
    }

    const siteIds = stored.map((s) => s.siteId);

    // Two collections, because they answer two questions and only one of them
    // can be answered by monitoring-locations. Sequential rather than
    // concurrent: the whole scope is one batch each, the check runs daily, and
    // a second in-flight request buys nothing worth the extra failure mode.
    const { found, unreached } = await fetchSitesByIds(siteIds);
    const { ends, unreached: endsUnreached } = await fetchSiteRecordEnds(siteIds);

    // Every batch failed. That is a check that learned nothing, and reporting
    // it as a clean pass over N stations is the exact confident-pass failure
    // this subsystem exists to catch. Throwing routes it through the
    // check_error path, which resolves nothing.
    if (found.size === 0) {
      throw new Error(
        `USGS returned nothing for any of the ${stored.length} stations in scope`,
      );
    }

    // A station is only fully examined when BOTH collections answered about it.
    // Counting one-sided answers would let a total time-series outage look like
    // a complete pass in which no station's record had ended — silence again,
    // read as health.
    const unreachedSet = new Set([...unreached, ...endsUnreached]);
    const findings = deriveSiteDriftFindings({
      stored,
      source: found,
      unreached: new Set(unreached),
      recordEnds: ends,
      now: ctx.now,
    });

    // Refuse an implausible mass death. See MASS_RECORD_ENDED_SHARE: every
    // station in scope is wired to an active river and was live at the last
    // import, so a majority going dark between two daily runs describes a
    // broken response far better than it describes the rivers.
    //
    // Throwing rather than filing a meta-finding, because the check_error path
    // already exists, is already tested, and does the one thing that matters
    // here — records the failure and resolves nothing. A run that filed 40
    // false high-severity findings would be far more expensive to undo than a
    // run that recorded an error.
    const ended = findings.filter((f) => f.ruleKey === 'usgs_site_record_ended').length;
    const examined = stored.filter((s) => !unreachedSet.has(s.siteId)).length;
    if (ended > MASS_RECORD_ENDED_FLOOR && ended > examined * MASS_RECORD_ENDED_SHARE) {
      throw new Error(
        `${ended} of ${examined} wired stations reported no current USGS record. ` +
          `That is a broken response, not a mass decommission — refusing to file it.`,
      );
    }

    // scopeCount counts stations an answer was actually obtained about, and
    // `partial` covers the rest. Without the flag, a partial outage would look
    // like silence about the unreached stations, and silence is what
    // reconciliation reads as "fixed".
    return {
      scopeCount: examined,
      findings,
      partial: unreachedSet.size > 0,
    };
  },
};
