#!/usr/bin/env npx tsx
/**
 * One-off access-point enrichment from agency map data (November 2026).
 *
 * WRITES NOTHING TO THE DATABASE. It reads approved access points, fetches
 * agency evidence near each one, and writes a review sheet proposing values for
 * columns that already exist:
 *
 *   parking_info      the surface of the agency parking lot(s) that belong to the
 *                     place: MDC Parking Lots sharing the area ID of its linked
 *                     MDC boat ramp, or AGFC Parking Areas linked to / named like
 *                     it. A lot far away, on the opposite bank, or nearer another
 *                     access point does not belong. No separate parking pin: the
 *                     launch pin stays the place's only coordinate.
 *   amenities         additions only: parking, restrooms, camping, boat_ramp, picnic.
 *   managing_agency   PAD-US manager, linked agency feature, ownership text.
 *   official_site_url USFS INFRA recreation site within 300 m.
 *   fee_required      same USFS site's fee flag.
 *   road_surface      nearest MVUM road (USFS ground only).
 *   ownership         exact spelling duplicates only; contradictions are flags.
 *
 * Only empty fields get proposals (amenities: only additions). Flags carry no
 * value and are never applied. `accept` is pre-filled `y` on high-confidence rows;
 * review the rest, then run scripts/repair-access-enrichment-2026-11.ts.
 *
 * Run from missouri-float-planner/ (Node 20):
 *   npx tsx scripts/ingestion/oneoff-access-enrichment-2026-11.ts
 *   npx tsx scripts/ingestion/oneoff-access-enrichment-2026-11.ts --river=current --out=/tmp/x
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { booleanPointInPolygon, point, pointToLineDistance, pointToPolygonDistance } from '@turf/turf';
import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { getScriptClient } from '../lib/db';
import {
  type AgencySignal, type LngLat, type Lot, type Proposal, type ProposalField, type Confidence,
  MAX_LOT_M, PADUS_NON_FEE, addAmenities, agencyFromOwnershipText, agencyFromPadus, belongsTo, chooseManagingAgency,
  mapLink, matchLots, metersBetween, parkingInfo, roadServes, mvumRoadSurface, nameCore, ownershipSpelling, toCsv,
  usfsFeeRequired, usfsHasRestroom,
} from './access-enrichment-2026-11';

const MDC = 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer';
const SOURCES = {
  mdcParking: { url: `${MDC}/26`, fields: 'OBJECTID,Area_ID,Area_Name,Surface,Allows_Trailers,ADA' },
  mdcPrivies: { url: `${MDC}/21`, fields: 'OBJECTID,Area_ID,Area_Name,ADA' },
  mdcCamping: { url: `${MDC}/27`, fields: 'OBJECTID,Area_ID,Area_Name,Type' },
  usfsSites: {
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0',
    fields: 'objectid,site_cn,site_name,public_site_name,site_subtype,development_status,fee_charged,fee_description,usda_portal_url,rec1stop_url,restroom_availability,open_season',
  },
  mvumRoads: {
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1',
    fields: 'objectid,id,name,surfacetype,seasonal,passengervehicle,highclearancevehicle,atv,districtname',
  },
} as const;

const USER_AGENT = 'eddy-float-planner/1.0 (one-off access enrichment; https://eddy.guide)';
const AMENITY_RADIUS_M = 300;
const USFS_SITE_RADIUS_M = 300;
const MVUM_RADIUS_M = 150;
const PADUS_NEAR_M = 30;

interface ArcFeature { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function arcgis(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}/query`, {
        method: 'POST', body, headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (json.error) throw new Error(`ArcGIS error ${JSON.stringify(json.error)}`);
      return json;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${(error as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

/** Every feature matching `filter`, by ID inventory then batches — record limits are not pagination. */
async function fetchAll(source: { url: string; fields: string }, filter: Record<string, string> = { where: '1=1' }) {
  const listing = await arcgis(source.url, { ...filter, returnIdsOnly: 'true' });
  const ids = (listing.objectIds as number[] | null) ?? [];
  const oidField = String(listing.objectIdFieldName ?? 'OBJECTID');
  const features: ArcFeature[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const want = ids.slice(i, i + 200);
    const page = await arcgis(source.url, {
      objectIds: want.join(','), outFields: source.fields, returnGeometry: 'true', outSR: '4326',
    });
    const got = (page.features as ArcFeature[]) ?? [];
    if (page.exceededTransferLimit || got.length !== want.length) {
      throw new Error(`${source.url}: batch returned ${got.length} of ${want.length}; rerun`);
    }
    features.push(...got);
  }
  return { features, oidField };
}

const envelope = ([lng, lat]: LngLat, meters: number) => {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat };
};
const envelopeFilter = (e: { xmin: number; ymin: number; xmax: number; ymax: number }) => ({
  where: '1=1', geometry: JSON.stringify({ ...e, spatialReference: { wkid: 4326 } }),
  geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
});
const featureUrl = (layer: string, oid: unknown) => `${layer}/query?objectIds=${oid}&outFields=*&outSR=4326&f=pjson`;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface AccessRow {
  id: string; slug: string; name: string; river_id: string | null; approved: boolean | null;
  location_orig: { coordinates?: number[] } | null;
  parking_info: string | null;
  amenities: string[] | null; managing_agency: string | null; ownership: string | null;
  official_site_url: string | null; fee_required: boolean | null; road_surface: string[] | null;
}
interface SourceRow {
  provider: 'mdc' | 'agfc'; source_id: string; source_type: string; name: string | null; owner: string | null;
  latitude: number; longitude: number; attributes: Record<string, unknown>;
  access_point_id: string | null; source_feature_url: string;
}

async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const known = new Set(['--river', '--out']);
  for (const a of process.argv.slice(2)) if (!known.has(a.split('=')[0])) throw new Error(`Unknown argument ${a}`);
  const onlyRiver = argValue('river');
  const outDir = argValue('out') ?? join(__dirname, 'agency-gis', '2026-11-oneoff');
  const retrievedAt = new Date().toISOString();
  const db = getScriptClient({ script: 'oneoff-access-enrichment-2026-11', write: false });

  const rivers = await selectAll<{ id: string; slug: string; geom: LineString | MultiLineString | null }>(
    (a, b) => db.from('rivers').select('id, slug, geom').order('id').range(a, b));
  const riverById = new Map(rivers.map((r) => [r.id, r]));
  const all = await selectAll<AccessRow>((a, b) => db.from('access_points')
    .select('id, slug, name, river_id, approved, location_orig, parking_info, amenities, managing_agency, ownership, official_site_url, fee_required, road_surface')
    .order('id').range(a, b));
  const pinOf = (r: AccessRow): LngLat | null => {
    const c = r.location_orig?.coordinates;
    return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
  };
  const targets = all.filter((r) => r.approved && pinOf(r) &&
    (!onlyRiver || riverById.get(r.river_id ?? '')?.slug === onlyRiver));
  const sourcesRows = await selectAll<SourceRow>((a, b) => db.from('agency_gis_features')
    .select('provider, source_id, source_type, name, owner, latitude, longitude, attributes, access_point_id, source_feature_url')
    .order('provider').order('source_id').range(a, b));
  console.log(`${targets.length} approved access points; ${sourcesRows.length} agency inventory rows.`);

  console.log('Fetching MDC parking lots, privies, camping sites…');
  const [mdcParking, mdcPrivies, mdcCamping] = await Promise.all([
    fetchAll(SOURCES.mdcParking), fetchAll(SOURCES.mdcPrivies), fetchAll(SOURCES.mdcCamping),
  ]);
  const xs = targets.map((t) => pinOf(t)![0]);
  const ys = targets.map((t) => pinOf(t)![1]);
  const box = { xmin: Math.min(...xs) - 0.02, ymin: Math.min(...ys) - 0.02, xmax: Math.max(...xs) + 0.02, ymax: Math.max(...ys) + 0.02 };
  console.log('Fetching USFS recreation sites…');
  const usfsSites = await fetchAll(SOURCES.usfsSites, envelopeFilter(box));
  console.log(`  MDC: ${mdcParking.features.length} lots, ${mdcPrivies.features.length} privies, ${mdcCamping.features.length} camping; USFS: ${usfsSites.features.length} sites.`);

  const at = (f: ArcFeature): LngLat => [Number(f.geometry?.x), Number(f.geometry?.y)];
  const pointGeom = ([lng, lat]: LngLat) => ({ type: 'Point', coordinates: [lng, lat] });
  /**
   * Every feature a proposal rests on, keyed by the ID the review sheet cites:
   * its layer, link, geometry and attributes — enough to re-check the match
   * without refetching. PAD-US parcels are cited by their public_lands ID; their
   * geometry stays in that table (a national forest is ~60,000 vertices).
   */
  const evidence: Record<string, { kind: string; url: string; geometry: unknown; attributes: Record<string, unknown> }> = {};
  const cite = (id: string, kind: string, url: string, geometry: unknown, attributes: Record<string, unknown>) => {
    evidence[id] = { kind, url, geometry, attributes };
    return id;
  };
  const citeArc = (prefix: string, layerUrl: string, f: ArcFeature, oidField = 'OBJECTID') =>
    cite(`${prefix}-${f.attributes[oidField]}`, prefix, featureUrl(layerUrl, f.attributes[oidField]), pointGeom(at(f)), f.attributes);
  const citeSource = (s: SourceRow) =>
    cite(`${s.provider}-${s.source_id}`, `${s.provider} ${s.source_type}`, s.source_feature_url,
      pointGeom([s.longitude, s.latitude]), { name: s.name, owner: s.owner, ...s.attributes });
  const proposals: Proposal[] = [];
  const counters = { padusCalls: 0, mvumCalls: 0 };
  const lotTally = { matched: 0, refused: 0, none: 0, lots: 0 };

  await mapLimit(targets, 6, async (ap) => {
    const pin = pinOf(ap)!;
    const river = riverById.get(ap.river_id ?? '');
    const riverGeom = river?.geom ?? null;
    const push = (field: ProposalField, current: unknown, proposed: unknown, confidence: Confidence,
      ev: string, ids: string[], note = '') => proposals.push({
      access_point_id: ap.id, slug: ap.slug, name: ap.name, river: river?.slug ?? '', field,
      current: JSON.stringify(current ?? null), proposed: confidence === 'flag' ? '' : JSON.stringify(proposed),
      confidence, evidence: ev, evidence_ids: ids.join(' '), evidence_url: ids.map((id) => evidence[id]?.url ?? '').join(' '),
      launch_map: mapLink(pin), note,
    });
    const others = all.filter((o) => o.id !== ap.id).map(pinOf).filter((p): p is LngLat => !!p && metersBetween(pin, p) < 2000);
    /** The same belonging test parking uses: distance, same bank, not nearer another access point. */
    const belongs = (p: LngLat, maxM: number) => belongsTo(pin, p, others, riverGeom, maxM);
    const linked = sourcesRows.filter((s) => s.access_point_id === ap.id);
    const mdcAreaIds = new Set(linked.filter((s) => s.provider === 'mdc').map((s) => Number(s.attributes.Area_ID)));
    const agfcNames = new Set([nameCore(ap.name), ...linked.filter((s) => s.provider === 'agfc').map((s) => nameCore(s.name))].filter(Boolean));
    /** AGFC features of these types tied to this place by a reviewed link, or unlinked with the same name. */
    const agfcCandidates = (types: string[]) => sourcesRows.filter((s) => s.provider === 'agfc' && types.includes(s.source_type) &&
      (s.access_point_id === ap.id || (!s.access_point_id && agfcNames.has(nameCore(s.name)))));
    /** MDC features in the same conservation area as the place's linked boat ramp. */
    const mdcCandidates = (layer: { features: ArcFeature[] }) => layer.features.filter((f) => mdcAreaIds.has(Number(f.attributes.Area_ID)));

    // ── PAD-US parcel at the launch ─────────────────────────────────────────
    counters.padusCalls++;
    const e = envelope(pin, PADUS_NEAR_M + 20);
    const { data: lands, error: landsError } = await db.rpc('public_lands_in_bbox', {
      p_west: e.xmin, p_south: e.ymin, p_east: e.xmax, p_north: e.ymax, p_tolerance: 0, p_limit: 50,
    });
    if (landsError) throw landsError;
    const parcels = ((lands as Array<{ id: string; unit_name: string; manager_name: string | null; designation: string | null; public_access: string | null; gis_acres: number | null; geojson: string }>) ?? [])
      .filter((l) => !PADUS_NON_FEE.has((l.designation ?? '').toUpperCase()))
      .filter((l) => {
        const g = JSON.parse(l.geojson) as Polygon | MultiPolygon;
        return booleanPointInPolygon(point(pin), g) || pointToPolygonDistance(point(pin), g, { units: 'meters' }) <= PADUS_NEAR_M;
      })
      // A Wild and Scenic River corridor is drawn around private land too, so any
      // other parcel at the launch is the better witness; then the smallest.
      .sort((a, b) => Number(a.designation === 'WSR') - Number(b.designation === 'WSR') ||
        Number(a.gis_acres ?? Infinity) - Number(b.gis_acres ?? Infinity));
    const parcel = parcels[0] ?? null;
    const parcelId = parcel
      ? cite(`padus-${parcel.id}`, 'PAD-US parcel', `public_lands.id=${parcel.id}`, { table: 'public_lands', id: parcel.id }, {
        unit_name: parcel.unit_name, manager_name: parcel.manager_name, designation: parcel.designation,
        public_access: parcel.public_access, gis_acres: parcel.gis_acres,
      })
      : null;
    // The MO/AR line (36.5°N, and 36°N in the Bootheel), used only to read PAD-US SFW/SDC.
    const stateCode = pin[1] < 36.5 && !(pin[0] > -90.4 && pin[1] > 36.0) ? 'AR' : 'MO';
    const padus = parcel ? agencyFromPadus(parcel.manager_name, stateCode) : null;

    // ── Parking lots that belong to this access point ───────────────────────
    // A lot is evidence about the place (there is parking; its surface), never
    // a second pin. Lots nearer another access point belong to that one.
    const lots: Lot[] = [
      ...mdcCandidates(mdcParking).map((f): Lot => ({
        id: `mdc-lot-${f.attributes.OBJECTID}`, at: at(f), tie: 'same_area', provider: 'mdc',
        url: featureUrl(SOURCES.mdcParking.url, f.attributes.OBJECTID), attributes: f.attributes,
      })),
      ...agfcCandidates(['Parking Area']).map((s): Lot => ({
        id: `agfc-${s.source_id}`, at: [s.longitude, s.latitude], tie: s.access_point_id === ap.id ? 'linked' : 'same_name',
        provider: 'agfc', url: s.source_feature_url, attributes: { name: s.name, ...s.attributes },
      })),
    ];
    const { match: lotMatch, refused: lotsRefused } = lots.length ? matchLots(pin, lots, others, riverGeom) : { match: null, refused: [] };
    lotTally[lotMatch ? 'matched' : lots.length ? 'refused' : 'none']++;
    const lotIds = (lotMatch?.lots ?? []).map(({ lot }) => cite(lot.id, `${lot.provider} parking lot`, lot.url, pointGeom(lot.at), lot.attributes));
    if (lotMatch) {
      lotTally.lots += lotMatch.lots.length;
      const info = parkingInfo(lotMatch.lots.map((l) => l.lot));
      const named = lotMatch.lots.map((l) => `${l.lot.provider.toUpperCase()} ${l.lot.tie.replace('_', ' ')}: ${String(l.lot.attributes.Area_Name ?? l.lot.attributes.name ?? l.lot.id)}`);
      if (info && !ap.parking_info) {
        push('parking_info', null, info, lotMatch.confidence, named.join(' | '), lotIds,
          [lotMatch.note, ...lotsRefused.map((r) => `refused ${r}`)].join('; '));
      }
    }

    // ── USFS recreation site: the nearest one that belongs to this place ────
    const site = usfsSites.features
      .map((f) => ({ f, b: belongs(at(f), USFS_SITE_RADIUS_M) }))
      .filter((s) => !s.b.refused)
      .sort((a, b) => a.b.meters - b.b.meters)[0] ?? null;
    const siteName = site ? String(site.f.attributes.public_site_name ?? site.f.attributes.site_name ?? '') : '';
    const siteId = site ? citeArc('usfs-site', SOURCES.usfsSites.url, site.f, 'objectid') : '';
    const siteConf: Confidence = site && site.b.meters <= 150 ? 'medium' : 'low';
    if (site) {
      const link = String(site.f.attributes.usda_portal_url ?? site.f.attributes.rec1stop_url ?? '').trim();
      if (link && !ap.official_site_url) {
        push('official_site_url', null, link, siteConf, `USFS site "${siteName}" (${site.f.attributes.site_subtype})`, [siteId], `${Math.round(site.b.meters)} m from launch`);
      }
      const fee = usfsFeeRequired(site.f.attributes.fee_charged);
      if (fee !== null && ap.fee_required == null) {
        push('fee_required', null, fee, siteConf, `USFS site "${siteName}" fee_charged=${site.f.attributes.fee_charged}`, [siteId],
          String(site.f.attributes.fee_description ?? ''));
      }
    }

    // ── Amenities (additions only) ──────────────────────────────────────────
    // Every feature passes the same belonging test as parking. `firm`: tied to
    // this place by a reviewed link or a shared MDC area ID AND bank-checked,
    // rather than by proximity or a matching name. Each addition cites its own feature.
    const add: { a: string; why: string; id: string; firm: boolean }[] = [];
    if (lotMatch) add.push({ a: 'parking', why: `${lotMatch.lots.length} agency parking lot(s)`, id: lotIds[0], firm: lotMatch.confidence === 'high' });
    const ramp = linked.find((s) => s.provider === 'mdc' && s.source_type === 'Boat Ramps');
    if (ramp) add.push({ a: 'boat_ramp', why: 'MDC Boat Ramps layer (reviewed link)', id: citeSource(ramp), firm: true });
    const nearestMdc = (layer: { features: ArcFeature[] }) => mdcCandidates(layer)
      .map((f) => ({ f, b: belongs(at(f), AMENITY_RADIUS_M) })).filter((x) => !x.b.refused).sort((x, y) => x.b.meters - y.b.meters)[0];
    const privy = nearestMdc(mdcPrivies);
    if (privy) add.push({ a: 'restrooms', why: `MDC privy, same area, ${Math.round(privy.b.meters)} m`, id: citeArc('mdc-privy', SOURCES.mdcPrivies.url, privy.f), firm: privy.b.bankChecked });
    const camp = nearestMdc(mdcCamping);
    if (camp) add.push({ a: 'camping', why: `MDC camping site (${camp.f.attributes.Type ?? 'type n/a'}), same area, ${Math.round(camp.b.meters)} m`, id: citeArc('mdc-camp', SOURCES.mdcCamping.url, camp.f), firm: camp.b.bankChecked });
    const nearestAgfc = (types: string[]) => agfcCandidates(types)
      .map((s) => ({ s, b: belongs([s.longitude, s.latitude], s.access_point_id === ap.id ? MAX_LOT_M : AMENITY_RADIUS_M) }))
      .filter((x) => !x.b.refused).sort((x, y) => x.b.meters - y.b.meters)[0];
    for (const [a, types] of [
      ['restrooms', ['Restroom']],
      ['camping', ['RVs Allowed - No Hookups', 'RVs Allowed - Hookups and Dump', 'RVs Allowed - Hookups', 'Tents Only']],
      ['picnic', ['Picnic Area', 'Pavillion']],
    ] as const) {
      const hit = nearestAgfc([...types]);
      if (hit) {
        add.push({ a, why: `AGFC ${hit.s.source_type}${hit.s.access_point_id === ap.id ? ' (reviewed link)' : ' (same name)'}, ${Math.round(hit.b.meters)} m`,
          id: citeSource(hit.s), firm: hit.s.access_point_id === ap.id && hit.b.bankChecked });
      }
    }
    if (site && site.b.meters <= 150 && usfsHasRestroom(site.f.attributes.restroom_availability)) {
      add.push({ a: 'restrooms', why: `USFS "${siteName}": ${site.f.attributes.restroom_availability}`, id: siteId, firm: false });
    }
    if (site && site.b.meters <= 150 && /CAMP/.test(String(site.f.attributes.site_subtype))) {
      add.push({ a: 'camping', why: `USFS "${siteName}" (${site.f.attributes.site_subtype})`, id: siteId, firm: false });
    }
    const next = addAmenities(ap.amenities, add.map((x) => x.a));
    if (next) {
      const added = next.slice((ap.amenities ?? []).length);
      // Cite the firmest source for each added amenity; the row is high only if every one is firm.
      const best = added.map((a) => add.filter((x) => x.a === a).sort((x, y) => Number(y.firm) - Number(x.firm))[0]);
      push('amenities', ap.amenities ?? [], next, best.every((b) => b.firm) ? 'high' : 'medium',
        best.map((b) => `${b.a}: ${b.why} [${b.id}]`).join(' | '), best.map((b) => b.id));
    }

    // ── Managing agency ─────────────────────────────────────────────────────
    if (!ap.managing_agency) {
      const signals: AgencySignal[] = [];
      const ids: string[] = [];
      if (parcel && parcelId && (padus?.agency || padus?.unsupported)) {
        signals.push({ ...padus!, source: 'padus', detail: `${parcel.unit_name} (${parcel.manager_name}, ${parcel.designation}${parcel.designation === 'WSR' ? ' corridor' : ''})` });
        ids.push(parcelId);
      }
      for (const s of linked) {
        if (s.provider === 'mdc') {
          signals.push({ agency: 'MDC', source: 'agency_link', detail: `MDC ${s.source_type}: ${s.name}` });
          ids.push(citeSource(s));
          continue;
        }
        const o = s.owner ?? '';
        const agency = /corps|usace|\bcoe\b/i.test(o) ? 'COE' : /national park|\bnps\b/i.test(o) ? 'NPS'
          : /forest service|usfs/i.test(o) ? 'USFS' : /state park/i.test(o) ? 'State Park'
          : /\bcity\b|town of/i.test(o) ? 'Municipal' : /county/i.test(o) ? 'County' : null;
        if (agency) signals.push({ agency, source: 'agency_link', detail: `AGFC record, owner "${o}"` });
        else if (/agfc|game and fish/i.test(o) || !o) signals.push({ agency: null, unsupported: 'AGFC', source: 'agency_link', detail: `AGFC record, owner "${o || 'n/a'}"` });
        else continue;
        ids.push(citeSource(s));
      }
      const fromText = agencyFromOwnershipText(ap.ownership);
      if (fromText) signals.push({ agency: fromText, source: 'ownership_text', detail: `ownership "${ap.ownership}"` });
      if (signals.length) {
        const pick = chooseManagingAgency(signals);
        if (pick.agency || pick.confidence === 'flag') push('managing_agency', null, pick.agency, pick.confidence, pick.evidence, ids);
      }
    }

    // ── Ownership spelling + contradictions ─────────────────────────────────
    const spelled = ownershipSpelling(ap.ownership);
    if (spelled) push('ownership', ap.ownership, spelled, 'high', 'spelling only', []);
    if (/^private$/i.test((ap.ownership ?? '').trim()) && padus?.agency && padus.agency !== 'Private') {
      push('ownership', ap.ownership, null, 'flag', `PAD-US: ${parcel!.unit_name} (${parcel!.manager_name})`, [parcelId!],
        `text says private; launch is on or within 30 m of a public parcel${parcel!.designation === 'WSR' ? ' (a Wild and Scenic corridor, which can include private land)' : ''}`);
    }

    // ── Road surface from MVUM (USFS ground only) ───────────────────────────
    // Only from a road whose NAME shows it serves this access (roadServes).
    // A nearby road that does not is a flag for a person, never a value.
    const usfsGround = padus?.agency === 'USFS' || /usfs/i.test(ap.ownership ?? '') || !!site;
    if (usfsGround && !(ap.road_surface?.length)) {
      counters.mvumCalls++;
      const { features } = await fetchAll(SOURCES.mvumRoads, envelopeFilter(envelope(pin, MVUM_RADIUS_M + 50)));
      const roads = features
        .filter((f) => f.geometry?.paths?.some((p) => p.length > 1))
        .map((f) => ({ f, m: Math.min(...f.geometry!.paths!.filter((p) => p.length > 1).map((p) =>
          pointToLineDistance(point(pin), { type: 'LineString', coordinates: p } as LineString, { units: 'meters' }))) }))
        .filter((r) => r.m <= MVUM_RADIUS_M)
        .sort((a, b) => a.m - b.m);
      const citeRoad = (r: (typeof roads)[number]) => cite(`mvum-${r.f.attributes.objectid}`, 'MVUM road',
        featureUrl(SOURCES.mvumRoads.url, r.f.attributes.objectid), { type: 'MultiLineString', coordinates: r.f.geometry!.paths }, r.f.attributes);
      const serving = roads.find((r) => roadServes(ap.name, r.f.attributes.name));
      const surface = serving ? mvumRoadSurface(serving.f.attributes.surfacetype, serving.f.attributes.seasonal) : null;
      if (serving && surface) {
        const a = serving.f.attributes;
        const hcvOnly = a.passengervehicle !== 'open' && a.highclearancevehicle === 'open';
        push('road_surface', ap.road_surface ?? [], surface, hcvOnly ? 'low' : 'medium',
          `MVUM road ${a.id} ${a.name ?? ''}: ${a.surfacetype}, ${a.seasonal ?? 'season n/a'}`, [citeRoad(serving)],
          `${Math.round(serving.m)} m from launch; road name matches the place${hcvOnly ? '; HIGH-CLEARANCE VEHICLES ONLY — add 4wd_required by hand if right' : ''}`);
      } else if (roads.length) {
        const r = roads[0];
        push('road_surface', ap.road_surface ?? [], null, 'flag',
          `nearest MVUM road ${r.f.attributes.id} ${r.f.attributes.name ?? ''} (${Math.round(r.m)} m) is not shown to serve this access`, [citeRoad(r)],
          'confirm the approach road before recording a surface');
      }
    }
  });

  const rank = { high: 0, medium: 1, low: 2, flag: 3 } as const;
  proposals.sort((a, b) => a.river.localeCompare(b.river) || a.slug.localeCompare(b.slug) || a.field.localeCompare(b.field) || rank[a.confidence] - rank[b.confidence]);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'review.csv'), toCsv(proposals));
  writeFileSync(join(outDir, 'sources.json'), `${JSON.stringify({
    retrieved_at: retrievedAt,
    scope: onlyRiver ?? 'all approved access points',
    access_points: targets.length,
    layers: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, s.url])),
    counts: {
      mdc_parking: mdcParking.features.length, mdc_privies: mdcPrivies.features.length,
      mdc_camping: mdcCamping.features.length, usfs_sites_in_bbox: usfsSites.features.length,
      padus_lookups: counters.padusCalls, mvum_lookups: counters.mvumCalls,
      parking: lotTally,
    },
    evidence,
  }, null, 2)}\n`);

  const summary: Record<string, Record<Confidence, number>> = {};
  for (const p of proposals) (summary[p.field] ??= { high: 0, medium: 0, low: 0, flag: 0 })[p.confidence]++;
  console.table(summary);
  console.log(`Parking: ${lotTally.matched} access points matched ${lotTally.lots} agency lots; ${lotTally.refused} had candidates that all belong elsewhere or are too far/across the river; ${lotTally.none} had none.`);
  console.log(`Wrote ${proposals.length} rows to ${join(outDir, 'review.csv')}. Nothing was written to the database.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

