// src/lib/national-map/noaa-flood.ts
// Read official NWS flood categories for every forecast point in the country.
//
// Source: NOAA's riv_gauges MapServer — the same service
// scripts/import-nwps-gauges.ts imports thresholds from (NWPS /v1/gauges?bbox
// has returned an empty list since 2026-07). Layer 0 is observed status,
// layer 15 the full forecast period. ~12,900 points; the layer pages at 2,000.
//
// Two reads per capture, a few times an hour, from one cron — never from a
// browser.

import { trackedFetch } from '@/lib/telemetry/upstream';
import { inNationalScope } from './scope';
import {
  parseNoaaNumber,
  parseNoaaStatus,
  parseNoaaTime,
  type FloodStatus,
} from './flood-status';
import type { NwsInput } from './frame';

const BASE = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer';
const OBSERVED_LAYER = 0;
const FORECAST_LAYER = 15;
const PAGE = 2000;
/** 20 pages is 40,000 points — three times the national count. A runaway, not a country. */
const MAX_PAGES = 20;

interface ArcFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: number; y?: number };
}

interface ArcPage {
  features?: ArcFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

export interface ObservedPoint {
  lid: string;
  lng: number;
  lat: number;
  status: FloodStatus;
  observedAt: number | null;
  observedValue: number | null;
  units: string | null;
  name: string;
  /** NOAA's own state (postal code) — the region of a point no USGS gauge claims. */
  state: string | null;
  ingestAt: number | null;
}

export interface ForecastPoint {
  lid: string;
  status: FloodStatus;
  validAt: number | null;
  issuedAt: number | null;
  ingestAt: number | null;
}

function nameOf(a: Record<string, unknown>): string {
  const water = typeof a.waterbody === 'string' ? a.waterbody.trim() : '';
  const where = typeof a.location === 'string' ? a.location.trim() : '';
  const lid = String(a.gaugelid ?? '').trim().toUpperCase();
  if (water && where) return `${water} at ${where}`;
  return water || where || lid;
}

/** Parse observed-layer features. Out-of-scope (territory) points are dropped here. */
export function parseObservedFeatures(features: ArcFeature[]): ObservedPoint[] {
  const out: ObservedPoint[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const lid = typeof a.gaugelid === 'string' ? a.gaugelid.trim().toUpperCase() : '';
    if (!lid) continue;
    // Geometry is requested in WGS84; latitude/longitude attributes are the
    // fallback when a feature arrives without a shape.
    const lng = typeof f.geometry?.x === 'number' ? f.geometry.x : parseNoaaNumber(a.longitude);
    const lat = typeof f.geometry?.y === 'number' ? f.geometry.y : parseNoaaNumber(a.latitude);
    if (lng === null || lat === null) continue;
    const state = typeof a.state === 'string' ? a.state : null;
    if (!inNationalScope(state, lng, lat)) continue;
    const ingest = typeof a.idp_ingestdate === 'number' ? a.idp_ingestdate : null;
    out.push({
      lid,
      lng,
      lat,
      status: parseNoaaStatus(a.status),
      observedAt: parseNoaaTime(a.obstime),
      observedValue: parseNoaaNumber(a.observed),
      units: typeof a.units === 'string' && a.units.trim() ? a.units.trim() : null,
      name: nameOf(a),
      state: state && /^[A-Z]{2}$/.test(state.trim().toUpperCase()) ? state.trim().toUpperCase() : null,
      ingestAt: ingest,
    });
  }
  return out;
}

export function parseForecastFeatures(features: ArcFeature[]): ForecastPoint[] {
  const out: ForecastPoint[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const lid = typeof a.gaugelid === 'string' ? a.gaugelid.trim().toUpperCase() : '';
    if (!lid) continue;
    out.push({
      lid,
      status: parseNoaaStatus(a.status),
      validAt: parseNoaaTime(a.fcsttime),
      issuedAt: parseNoaaTime(a.fcstissunc),
      ingestAt: typeof a.idp_ingestdate === 'number' ? a.idp_ingestdate : null,
    });
  }
  return out;
}

/**
 * Join observed and forecast by LID. A point with no forecast row is
 * `unknown` forecast — never `no_flooding`.
 */
export function mergeNoaa(observed: ObservedPoint[], forecast: ForecastPoint[]): NwsInput[] {
  const fc = new Map(forecast.map((f) => [f.lid, f]));
  return observed.map((o) => {
    const f = fc.get(o.lid);
    return {
      lid: o.lid,
      lng: o.lng,
      lat: o.lat,
      observed: o.status,
      observedAt: o.observedAt,
      observedValue: o.observedValue,
      units: o.units,
      forecast: f?.status ?? 'unknown',
      forecastValidAt: f?.validAt ?? null,
      forecastIssuedAt: f?.issuedAt ?? null,
      name: o.name,
      state: o.state,
    };
  });
}

/** Newest ingest stamp across a layer, as ISO — the layer's own freshness. */
export function newestIngest(points: Array<{ ingestAt: number | null }>): string | null {
  let max = -Infinity;
  for (const p of points) if (p.ingestAt !== null && p.ingestAt > max) max = p.ingestAt;
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

async function readLayer(layer: number, outFields: string, geometry: boolean): Promise<ArcFeature[]> {
  const all: ArcFeature[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${BASE}/${layer}/query`);
    url.searchParams.set('where', '1=1');
    url.searchParams.set('outFields', outFields);
    url.searchParams.set('returnGeometry', geometry ? 'true' : 'false');
    if (geometry) url.searchParams.set('outSR', '4326');
    // A stable order is what makes offset paging safe (the same lesson the
    // gauge_stations walkers learned): without it pages can overlap and skip.
    url.searchParams.set('orderByFields', 'objectid');
    url.searchParams.set('resultOffset', String(page * PAGE));
    url.searchParams.set('resultRecordCount', String(PAGE));
    url.searchParams.set('f', 'json');
    const res = await trackedFetch('nws', `riv_gauges_layer_${layer}`, url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`riv_gauges layer ${layer} page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as ArcPage;
    if (body.error) throw new Error(`riv_gauges layer ${layer}: ${body.error.message ?? 'error'}`);
    const features = body.features ?? [];
    all.push(...features);
    if (!features.length || !body.exceededTransferLimit) return all;
  }
  throw new Error(`riv_gauges layer ${layer} exceeded ${MAX_PAGES} pages`);
}

export async function fetchNoaaFloodStatus(): Promise<{
  points: NwsInput[];
  observedIngestAt: string | null;
  forecastIngestAt: string | null;
}> {
  const [obsFeatures, fcFeatures] = await Promise.all([
    readLayer(
      OBSERVED_LAYER,
      'objectid,gaugelid,status,location,waterbody,state,obstime,observed,units,latitude,longitude,idp_ingestdate',
      true,
    ),
    readLayer(FORECAST_LAYER, 'objectid,gaugelid,status,fcsttime,fcstissunc,idp_ingestdate', false),
  ]);
  const observed = parseObservedFeatures(obsFeatures);
  const forecast = parseForecastFeatures(fcFeatures);
  // A near-empty observed layer is an outage, not a quiet country: the real
  // layer carries ~12,900 points. Refuse it so the frame records noaaOk=false.
  if (observed.length < 1000) {
    throw new Error(`riv_gauges observed layer returned only ${observed.length} points`);
  }
  return {
    points: mergeNoaa(observed, forecast),
    observedIngestAt: newestIngest(observed),
    forecastIngestAt: newestIngest(forecast),
  };
}
