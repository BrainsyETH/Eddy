// src/app/api/gauges/[siteId]/route.ts
// GET /api/gauges/[siteId] — one station, whichever tier it belongs to.
//
// ── Why this route did not exist until now ──────────────────────────────────
// Every surface that needed a gauge already held a LIST of them. The website's
// /gauges/[slug] page finds its station inside the ~46-row /api/gauges payload;
// the map finds its pins inside a viewport response. Both work because both had
// already paid for the list.
//
// The iOS gauge screen cannot. It is reached from a map callout, from a starred
// gauge row, from a search result and from a deep link, and in three of those
// four cases the station is a national one that /api/gauges has never returned
// — it is curated-only by design, for the 414-taking reasons in that file's
// header. Asking for a 300-gauge viewport to render one station would be absurd,
// and asking for 14,300 is the failure that route was rewritten to avoid.
//
// So: one station, by site id, both tiers, one request.
//
// ── Coordinates come from search_gauges, not from a WKB parse ───────────────
// Locations live in a PostGIS geometry column, and PostgREST cannot project one
// — which is why /api/gauges hand-rolls parseWKBHex() and falls back to
// {lng:0,lat:0} when it fails. Null island is a bug you can absorb across 46
// pins and cannot on a detail screen that is ABOUT one station's location.
//
// search_gauges (00196) already does st_x/st_y in the database and already
// resolves either id column, so this route reuses it as an exact lookup rather
// than adding a near-identical RPC. It matches site ids by PREFIX, so the exact
// row is picked out below rather than trusted to be first.
//
// It is reached through the ADMIN client because that one is untyped:
// src/types/database.ts predates 00196, so an .rpc('search_gauges') against the
// typed anon client does not compile. Same reason /api/search still hand-rolls
// its gauge query. Gauge stations are public reference data — the same data
// /api/gauges and /api/gauges/map already serve through this client — so no RLS
// decision is being bypassed here.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { DEFAULT_PROVIDER_ID, getFlowProvider } from '@/lib/flow-providers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { maxReadingAgeHours } from '@/lib/alerts/gate';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { resolveFloodStages, type GaugeFloodStages } from '@/lib/gauges/flood-stages';
import { fetchWaterTemperature, type WaterTemperature } from '@/lib/usgs/water-temperature';
import { fetchDissolvedOxygen, type DissolvedOxygen } from '@/lib/usgs/dissolved-oxygen';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import {
  PARAM_DISCHARGE,
  readSnapshotStatistics,
  seasonalBandEligible,
} from '@/lib/usgs/percentile-snapshot';
import { flowBand, type FlowBand } from '@shared/flow-band';
import type { HistoryCapabilities } from '@/lib/flow-providers/types';
import { toNum } from '@/lib/utils/num';
import { withX402Route } from '@/lib/x402-config';
import { orderRiverLinks } from '@shared/primary-river-link';

export const dynamic = 'force-dynamic';

/**
 * A stored reading older than the gate's own limit is refreshed from the
 * provider before the response goes out.
 *
 * Since 00196 the update-gauges cron polls only curated and starred stations,
 * and sync-gauge-latest runs hourly over the rest. A station that is neither can
 * sit with a reading from last week, which is fine on a map pin and not fine on
 * the screen whose entire job is to state that number.
 *
 * NOW THE GATE'S THRESHOLD rather than a local 6. This route is what the alert
 * configure screen reads to anchor a threshold field, so a reading it is willing
 * to display is a reading someone will set an alert against — and the gate
 * refuses to act on a USGS reading past three hours. Serving one this endpoint
 * knew was beyond that, without even trying the provider, is how the two halves
 * came to disagree about what "now" means.
 *
 * The live call is ONE site, not a batch, and it only fires on the stale path.
 */

/** search_gauges caps at 50; a site-id prefix cannot plausibly need more. */
const LOOKUP_LIMIT = 50;

export interface GaugeDetailThreshold {
  riverId: string;
  riverName: string;
  riverSlug: string | null;
  isPrimary: boolean;
  thresholdUnit: 'ft' | 'cfs';
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  floodStageFt: number | null;
}

/**
 * Official NWS thresholds for a station, in FEET.
 *
 * Assembled from EITHER of the two places this project keeps them, because
 * which one holds a given station is an artefact of how it was gathered rather
 * than anything a client should have to know:
 *
 *   gauge_stations.nwps_*_stage_ft  the national import (00196 columns,
 *                                   scripts/import-nwps-gauges.ts), matched
 *                                   spatially against the NOAA gauge layer and
 *                                   written only for UNCURATED stations.
 *   river_gauges.flood_stage_ft     the curated path (00165), accepted only
 *                                   after the USGS id NWPS reported matched
 *                                   ours. Lives on the PAIRING because a ladder
 *                                   does — but a flood stage is a property of
 *                                   the station, so it is republished here.
 *
 * The station-level columns win where both exist. `source` says which answered.
 *
 * FEET ONLY. NWPS publishes stages and its category `flow` comes back as -9999
 * everywhere, so nothing downstream may compare these against discharge.
 */
export type { GaugeFloodStages } from '@/lib/gauges/flood-stages';

export interface GaugeDetail {
  /** gauge_stations.id — the key stars are stored under. */
  id: string;
  /** The provider-native site id this was looked up by. */
  siteId: string;
  name: string;
  /** Registry id from src/lib/flow-providers; 'usgs' when the column is null. */
  provider: string;
  /** Eddy rates this station against at least one river. */
  curated: boolean;
  coordinates: { lng: number; lat: number };
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  readingSuspect: boolean;
  qualifierNote: string | null;
  /** 0-100 vs this site's own day-of-year history; null when none is held. */
  flowPercentile: number | null;
  /**
   * The seasonal comparison as one self-describing object: which parameter it
   * compares, where today sits, which band that is (shared/flow-band.ts
   * vocabulary — deliberately NOT FlowRating, whose two declarations disagree),
   * and how deep the record behind it runs. Null whenever the publication
   * policy withholds it (thin record, stage datum unresolved) — a missing
   * comparison is strictly better than a confident wrong one. flowPercentile
   * above stays live for deployed clients.
   */
  seasonalContext: {
    unit: 'ft' | 'cfs';
    parameterCode: string;
    percentile: number;
    band: FlowBand;
    yearsOfRecord: number | null;
    asOf: string;
  } | null;
  /**
   * What this station's provider can serve /history requests from — on the
   * wire because there is no client-side provider registry to consult, and a
   * client-side table would be a second copy waiting to drift. Lets a client
   * disable an unsupported range preset with an explanation instead of
   * requesting it and shrugging at the truncation.
   */
  historyCapabilities: HistoryCapabilities;
  /**
   * The ladder, per river this station grades.
   *
   * Null — not an empty array — for a station Eddy has not rated, so a consumer
   * can tell "no ladder exists" from "the ladder came back empty". Every
   * national gauge is in the first case, and that is the ordinary case here.
   */
  thresholds: GaugeDetailThreshold[] | null;
  /** Null when the station is not an NWS forecast point — most are not. */
  floodStages: GaugeFloodStages | null;
  /**
   * Latest water temperature (USGS parameter 00010, served in °F), with the
   * time it was measured. Null is the ORDINARY case — most Ozark stations
   * publish no water-temperature series at all — and clients omit the row
   * rather than rendering a placeholder. Old values are still served; the
   * display rule is "always with its measurement age", not a freshness gate.
   */
  waterTemperature: WaterTemperature | null;
  /**
   * Latest dissolved oxygen (USGS parameter 00300, mg/L), with the time it was
   * measured. Null is the ordinary case for the same reason as above, with one
   * class of exception: the water-quality monitors below the White River system
   * dams publish 00300 and 00010 and no flow at all, so on a tailwater this is
   * a large share of what exists to report. Served as a bare number with its
   * unit and age — no habitat verdict is attached to it here.
   */
  dissolvedOxygen: DissolvedOxygen | null;
  /** The station's own public page, or null for a provider without one. */
  publicUrl: string | null;
  /**
   * gauge_stations.threshold_descriptions.note — what this station's reading
   * means, in the words written for it.
   *
   * Carries the weight for a station with no ladder and no percentile, which
   * is exactly a USACE dam release: neither vocabulary applies, so the prose
   * is the only true thing left to say about the number.
   */
  stationNote: string | null;
}

export interface GaugeDetailResponse {
  gauge: GaugeDetail;
}

interface SearchGaugeRow {
  id: string;
  site_id: string | null;
  name: string | null;
  curated: boolean;
  lng: number | null;
  lat: number | null;
  discharge_cfs: number | string | null;
  gauge_height_ft: number | string | null;
  reading_timestamp: string | null;
  flow_percentile: number | null;
}

function ageHoursOf(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / 3_600_000;
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  // 60/min, matching /api/gauges. This is a screen open, not a pan.
  const limited = await rateLimit(`gauge-detail:${getClientIp(request)}`, 60, 60 * 1000);
  if (limited) return limited;

  const { siteId: rawSiteId } = await params;
  const siteId = rawSiteId.trim();
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: matches, error: lookupError } = await supabase.rpc('search_gauges', {
      p_query: siteId,
      p_limit: LOOKUP_LIMIT,
    });

    if (lookupError) {
      console.error('[gauges/:siteId] search_gauges failed:', lookupError.message);
      return NextResponse.json({ error: 'Gauge lookup unavailable' }, { status: 500 });
    }

    // EXACT match only. The RPC matches site ids by prefix so it can serve a
    // search box, and "0701" must not resolve to whichever station happens to
    // sort first — a detail screen showing the wrong gauge's number is worse
    // than a 404.
    const row = ((matches ?? []) as SearchGaugeRow[]).find((g) => g.site_id === siteId) ?? null;

    if (!row) {
      return NextResponse.json({ error: 'Gauge not found' }, { status: 404 });
    }

    // Everything else keys off the station uuid and is independent, so it goes
    // out together rather than in a waterfall.
    const [stationResult, currentReadings, linksResult] = await Promise.all([
      supabase
        .from('gauge_stations')
        .select(
          `provider,
           threshold_descriptions,
           nws_lid,
           nwps_action_stage_ft,
           nwps_flood_stage_ft,
           nwps_moderate_stage_ft,
           nwps_major_stage_ft`
        )
        .eq('id', row.id)
        .maybeSingle(),
      // NOT a bare gauge_latest read any more. search_gauges above joins
      // gauge_latest, which for a CURATED station is the older of the two tiers
      // — it is rewritten once an hour at :20, while update-gauges appends to
      // gauge_readings hourly and every 15 minutes on a rising river. Reading
      // only gauge_latest is why this screen showed 80 cfs while a search row
      // for the same station showed 87 in the same minute, and why an alert
      // typed against this screen seeded from a number the user never saw.
      loadCurrentReadings(supabase, [row.id]),
      supabase
        .from('river_gauges')
        .select(
          `gauge_station_id,
           is_primary,
           distance_from_section_miles,
           threshold_unit,
           level_too_low,
           level_low,
           level_optimal_min,
           level_optimal_max,
           level_high,
           level_dangerous,
           flood_stage_ft,
           action_stage_ft,
           rivers!inner ( id, name, slug, active )`
        )
        .eq('gauge_station_id', row.id),
    ]);

    const provider =
      ((stationResult.data as { provider?: string | null } | null)?.provider as string | null) ??
      DEFAULT_PROVIDER_ID;

    // Started here, awaited at the end — it needs only the provider, and the
    // reading pipeline below should not wait on it. USGS-only: the parameter
    // is a USGS vocabulary, and a dam slug or NWS LID means nothing to that
    // API. (USACE tailwater temperature is a different pipeline, on dam
    // screens, and stays there.)
    // Which USGS site can answer for water quality at this station.
    //
    // For a USGS station: itself. For a USACE dam release — the primary gauge
    // on every tailwater Eddy carries — the release measures discharge and
    // nothing else, so 00010/00300 must come from the tailwater's own
    // water-quality monitor, declared in the registry. Without this the
    // parameter was unreachable on exactly the rivers it was added for: three
    // primary gauges with provider 'usace', a provider gate that only asked
    // USGS about its own stations, and four sites publishing dissolved oxygen
    // a mile downstream that nothing ever queried.
    //
    // A reading borrowed this way is stamped with the station that produced
    // it. An unattributed number would read as this gauge's own.
    const waterQuality: { siteId: string; name?: string } | null = (() => {
      if (provider === 'usgs') return { siteId };
      const tw = getUsaceDam(siteId)?.tailwater;
      if (!tw?.waterQualitySiteId) return null;
      return { siteId: tw.waterQualitySiteId, name: tw.waterQualitySiteName };
    })();
    const borrowed = waterQuality != null && waterQuality.siteId !== siteId;

    // A BORROWED reading gets an age limit that a station's own does not.
    //
    // water-temperature.ts serves a station's own reading however old it is,
    // on the reasoning that water temperature moves slowly and a dated number
    // is still useful. That holds for the gauge you actually asked about. It
    // does not hold for one fetched from a neighbouring station on this
    // route's initiative: nobody asked for it, and a dead sensor is a real
    // possibility rather than a hypothetical. Probed 2026-08-25, USGS
    // 07053450 below Table Rock returned dissolved oxygen from twenty minutes
    // ago and a water temperature from JANUARY 2025 — the DO sensor lives, the
    // thermistor does not. Nineteen months is not "slow-moving", it is a
    // different year, and it would have rendered under a live release reading
    // as though it belonged to it.
    const BORROWED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const stamp = <T extends { observedAt: string }>(v: T | null): T | null => {
      if (!v || !borrowed) return v;
      const age = Date.now() - new Date(v.observedAt).getTime();
      if (!Number.isFinite(age) || age > BORROWED_MAX_AGE_MS) return null;
      return { ...v, measuredAtSiteId: waterQuality!.siteId, measuredAtName: waterQuality!.name };
    };

    const waterTemperaturePromise: Promise<WaterTemperature | null> = waterQuality
      ? fetchWaterTemperature(waterQuality.siteId).then(stamp)
      : Promise.resolve(null);
    // Same treatment, same reasoning, same resolution.
    const dissolvedOxygenPromise: Promise<DissolvedOxygen | null> = waterQuality
      ? fetchDissolvedOxygen(waterQuality.siteId).then(stamp)
      : Promise.resolve(null);

    // The station's own prose about what its number means. Written per station
    // in gauge_stations.threshold_descriptions — migration 00198 put the one
    // that matters most there, explaining that the Black below Clearwater runs
    // at whatever the Corps releases. A station with no ladder has nothing else
    // to say about its reading, so this is the only honest thing on that screen.
    const stationNote =
      ((stationResult.data as { threshold_descriptions?: { note?: string } | null } | null)
        ?.threshold_descriptions?.note as string | undefined) ?? null;
    // The merged reading wins over the RPC's gauge_latest join whenever it has
    // one; it IS that row for any station whose curated history is older or
    // absent, so this is never a downgrade.
    const current = currentReadings.get(row.id) ?? null;

    let qualifiers = current?.qualifiers ?? null;

    let gaugeHeightFt = current ? current.gauge_height_ft : toNum(row.gauge_height_ft);
    let dischargeCfs = current ? current.discharge_cfs : toNum(row.discharge_cfs);
    let readingTimestamp = current ? current.reading_at : row.reading_timestamp;

    // ── The stale path ──────────────────────────────────────────────────────
    // Never fatal: a failed refresh leaves the stored reading in place, and the
    // response still states its age honestly. An old number the client can see
    // is old beats an error on a screen someone opened to read a number.
    const storedAge = ageHoursOf(readingTimestamp);
    if (storedAge === null || storedAge > maxReadingAgeHours(provider)) {
      try {
        const flowProvider = getFlowProvider(provider);
        const live = flowProvider ? await flowProvider.fetchLatest([siteId]) : [];
        const fresh = live.find((r) => r.siteId === siteId) ?? null;
        if (fresh && (fresh.gaugeHeightFt !== null || fresh.dischargeCfs !== null)) {
          gaugeHeightFt = fresh.gaugeHeightFt;
          dischargeCfs = fresh.dischargeCfs;
          readingTimestamp = fresh.readingTimestamp;
          qualifiers = fresh.qualifiers ?? null;
        }
      } catch (err) {
        console.error('[gauges/:siteId] live refresh failed:', err);
      }
    }

    const { suspect, note } = classifyQualifiers(qualifiers, provider);

    type LinkRow = {
      is_primary: boolean | null;
      distance_from_section_miles: number | null;
      action_stage_ft: number | null;
      threshold_unit: string | null;
      level_too_low: number | null;
      level_low: number | null;
      level_optimal_min: number | null;
      level_optimal_max: number | null;
      level_high: number | null;
      level_dangerous: number | null;
      flood_stage_ft: number | null;
      rivers: { id: string; name: string; slug: string | null; active: boolean | null };
    };

    const links = (linksResult.data ?? []) as unknown as LinkRow[];
    const thresholds: GaugeDetailThreshold[] = links
      // An association to an inactive river is not a ladder anyone should be
      // graded against — the same skip /api/gauges makes.
      .filter((link) => link.rivers && link.rivers.active !== false)
      .map((link) => ({
        riverId: link.rivers.id,
        riverName: link.rivers.name,
        riverSlug: link.rivers.slug ?? null,
        isPrimary: link.is_primary ?? false,
        thresholdUnit: (link.threshold_unit === 'cfs' ? 'cfs' : 'ft') as 'ft' | 'cfs',
        levelTooLow: toNum(link.level_too_low),
        levelLow: toNum(link.level_low),
        levelOptimalMin: toNum(link.level_optimal_min),
        levelOptimalMax: toNum(link.level_optimal_max),
        levelHigh: toNum(link.level_high),
        levelDangerous: toNum(link.level_dangerous),
        floodStageFt: toNum(link.flood_stage_ft),
        distanceFromSectionMiles: toNum(link.distance_from_section_miles),
      }));

    // Primary first, so a consumer taking [0] gets the association the app
    // should navigate to without re-sorting.
    //
    // Not a bare isPrimary comparator any more: with TWO primaries — 07014000
    // is legitimately primary for Huzzah and for Courtois, which borrows it —
    // that comparator returned 0 for both and the arbitrary query order
    // survived. orderRiverLinks breaks the tie on distance, which is what puts
    // the gauge on the Huzzah where it physically sits.
    const orderedThresholds = orderRiverLinks(thresholds);

    // ── The NWS stages ──────────────────────────────────────────────────────
    // Precedence (station nwps_* columns win, curated pairing is the fallback,
    // no minor flood → not published) lives in src/lib/gauges/flood-stages.ts,
    // shared with /api/conditions/[riverId] so the river screen and this one
    // cannot disagree about a station's official thresholds.
    const station = stationResult.data as {
      nws_lid?: string | null;
      nwps_action_stage_ft?: number | null;
      nwps_flood_stage_ft?: number | null;
      nwps_moderate_stage_ft?: number | null;
      nwps_major_stage_ft?: number | null;
    } | null;

    // Same tiebreak as the thresholds array above, so the flood stage quoted
    // here belongs to the river the client will name. find(is_primary) picked
    // arbitrarily between Huzzah and Courtois.
    const curatedLink =
      orderRiverLinks(
        links.map((l) => ({
          ...l,
          isPrimary: l.is_primary ?? false,
          riverSlug: l.rivers?.slug ?? null,
          distanceFromSectionMiles: l.distance_from_section_miles,
        })),
      )[0] ?? null;

    const floodStages: GaugeFloodStages | null = resolveFloodStages(station, curatedLink);

    const waterTemperature = await waterTemperaturePromise;
    const dissolvedOxygen = await dissolvedOxygenPromise;

    // The seasonal comparison, published only when the policy allows it: the
    // band vocabulary is shared/flow-band.ts, the eligibility gate (record
    // depth, stage datum silence) is percentile-snapshot.ts's. yearsOfRecord
    // comes from the row actually used, never assumed across parameters.
    let seasonalContext: GaugeDetail['seasonalContext'] = null;
    if (provider === 'usgs' && row.flow_percentile != null) {
      const band = flowBand(row.flow_percentile);
      const statsRow = band ? await readSnapshotStatistics(supabase, siteId) : null;
      if (
        band &&
        statsRow &&
        seasonalBandEligible({
          parameterCode: PARAM_DISCHARGE,
          yearsOfRecord: statsRow.yearsOfRecord,
        })
      ) {
        seasonalContext = {
          unit: 'cfs',
          parameterCode: PARAM_DISCHARGE,
          percentile: row.flow_percentile,
          band,
          yearsOfRecord: statsRow.yearsOfRecord,
          asOf: new Date().toISOString(),
        };
      }
    }

    const gauge: GaugeDetail = {
      id: row.id,
      siteId,
      name: row.name ?? siteId,
      provider,
      curated: row.curated,
      // st_x/st_y in the database, so a null here means the station genuinely
      // has no location rather than that a parse failed.
      coordinates: { lng: row.lng ?? 0, lat: row.lat ?? 0 },
      gaugeHeightFt,
      dischargeCfs,
      readingTimestamp,
      readingAgeHours: ageHoursOf(readingTimestamp),
      readingSuspect: suspect,
      qualifierNote: note,
      flowPercentile: row.flow_percentile,
      seasonalContext,
      historyCapabilities: getFlowProvider(provider)?.historyCapabilities ?? {
        maxInstantDays: 30,
        supportsDaily: false,
        supportsCustomRange: false,
      },
      thresholds: orderedThresholds.length > 0 ? orderedThresholds : null,
      floodStages,
      waterTemperature,
      dissolvedOxygen,
      publicUrl: getFlowProvider(provider)?.publicUrl(siteId) ?? null,
      stationNote,
    };

    // Short CDN window: this is a live reading, and the stale path above means
    // a cached response can outlive the refresh it just paid for.
    return NextResponse.json<GaugeDetailResponse>(
      { gauge },
      { headers: cdnCacheHeaders(120, 600) }
    );
  } catch (err) {
    console.error('[gauges/:siteId] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(
  _GET,
  '/api/gauges/:siteId'
);
