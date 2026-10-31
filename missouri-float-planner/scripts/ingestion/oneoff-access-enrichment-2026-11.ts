#!/usr/bin/env npx tsx
/**
 * One-off access-point enrichment from agency map data (November 2026).
 *
 * WRITES NOTHING TO THE DATABASE. It reads approved access points, fetches
 * agency evidence near each one, and writes a review sheet proposing values for
 * columns that already exist:
 *
 *   driving_pin       primary parking lot — MDC Parking Lots sharing the area ID
 *                     of the place's linked MDC boat ramp, or AGFC Parking Area
 *                     features linked to / named like the place. Refused when
 *                     far, on the opposite bank, or nearer another access point.
 *   parking_info      surface / trailer facts stated by the MDC lot.
 *   amenities         additions only: parking, restrooms, camping, boat_ramp, picnic.
 *   managing_agency   PAD-US manager, linked agency feature, ownership text.
 *   official_site_url USFS INFRA recreation site within 300 m.
 *   fee_required      same USFS site's fee flag.
 *   road_surface      nearest MVUM road (USFS ground only).
 *   ownership         exact spelling duplicates only; contradictions are flags.
 *
 * Only empty fields get proposals (amenities: only additions). Flags carry no
 * value and are never applied. Fill `accept` with `y` for rows to apply, then
 * run scripts/repair-access-enrichment-2026-11.ts.
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
  PADUS_NON_FEE, addAmenities, agencyFromOwnershipText, agencyFromPadus, chooseLot, chooseManagingAgency,
  mapLink, mdcParkingInfo, metersBetween, mvumRoadSurface, nameCore, ownershipSpelling, toCsv,
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
  driving_lat: number | null; driving_lng: number | null; parking_info: string | null;
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
    .select('id, slug, name, river_id, approved, location_orig, driving_lat, driving_lng, parking_info, amenities, managing_agency, ownership, official_site_url, fee_required, road_surface')
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
  const evidence: Record<string, unknown> = {};
  const proposals: Proposal[] = [];
  const counters = { padusCalls: 0, mvumCalls: 0 };

  await mapLimit(targets, 6, async (ap) => {
    const pin = pinOf(ap)!;
    const river = riverById.get(ap.river_id ?? '');
    const riverGeom = river?.geom ?? null;
    const push = (field: ProposalField, current: unknown, proposed: unknown, confidence: Confidence,
      ev: string, url: string, note = '', proposedAt: LngLat | null = null) => proposals.push({
      access_point_id: ap.id, slug: ap.slug, name: ap.name, river: river?.slug ?? '', field,
      current: JSON.stringify(current ?? null), proposed: confidence === 'flag' ? '' : JSON.stringify(proposed),
      confidence, evidence: ev, evidence_url: url, launch_map: mapLink(pin),
      proposed_map: proposedAt ? mapLink(proposedAt) : '', note,
    });
    const near = (p: LngLat, m: number) => metersBetween(pin, p) <= m;
    const linked = sourcesRows.filter((s) => s.access_point_id === ap.id);
    const mdcAreaIds = new Set(linked.filter((s) => s.provider === 'mdc').map((s) => Number(s.attributes.Area_ID)));
    const agfcNames = new Set([nameCore(ap.name), ...linked.filter((s) => s.provider === 'agfc').map((s) => nameCore(s.name))].filter(Boolean));
    const agfcNear = (types: string[], m: number) => sourcesRows.filter((s) => s.provider === 'agfc' && types.includes(s.source_type) &&
      (s.access_point_id === ap.id || (!s.access_point_id && agfcNames.has(nameCore(s.name)) && near([s.longitude, s.latitude], m))));
    const mdcNear = (layer: { features: ArcFeature[] }, m: number) =>
      layer.features.filter((f) => mdcAreaIds.has(Number(f.attributes.Area_ID)) && near(at(f), m));

    // ── PAD-US parcel at the launch ─────────────────────────────────────────
    counters.padusCalls++;
    const e = envelope(pin, PADUS_NEAR_M + 20);
    const { data: lands, error: landsError } = await db.rpc('public_lands_in_bbox', {
      p_west: e.xmin, p_south: e.ymin, p_east: e.xmax, p_north: e.ymax, p_tolerance: 0, p_limit: 50,
    });
    if (landsError) throw landsError;
    const parcels = ((lands as Array<{ unit_name: string; manager_name: string | null; designation: string | null; gis_acres: number | null; geojson: string }>) ?? [])
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
    // The MO/AR line (36.5°N, and 36°N in the Bootheel), used only to read PAD-US SFW/SDC.
    const stateCode = pin[1] < 36.5 && !(pin[0] > -90.4 && pin[1] > 36.0) ? 'AR' : 'MO';
    const padus = parcel ? agencyFromPadus(parcel.manager_name, stateCode) : null;

    // ── Parking pin + parking info ──────────────────────────────────────────
    const lots: Lot[] = [
      ...mdcNear(mdcParking, 1000).map((f): Lot => ({
        id: `mdc-lot-${f.attributes.OBJECTID}`, at: at(f), tie: 'same_area', provider: 'mdc',
        url: featureUrl(SOURCES.mdcParking.url, f.attributes.OBJECTID), attributes: f.attributes,
      })),
      ...agfcNear(['Parking Area'], 1000).map((s): Lot => ({
        id: `agfc-${s.source_id}`, at: [s.longitude, s.latitude], tie: s.access_point_id === ap.id ? 'linked' : 'same_name',
        provider: 'agfc', url: s.source_feature_url, attributes: s.attributes,
      })),
    ];
    let lotChosen = false;
    if (lots.length && ap.driving_lat == null) {
      const others = all.filter((o) => o.id !== ap.id).map(pinOf).filter((p): p is LngLat => !!p && metersBetween(pin, p) < 2000);
      const { choice, refused } = chooseLot(pin, lots, others, riverGeom);
      if (choice) {
        lotChosen = true;
        evidence[choice.lot.id] = choice.lot.attributes;
        const [lng, lat] = choice.lot.at;
        push('driving_pin', null, [Number(lat.toFixed(6)), Number(lng.toFixed(6))], choice.confidence,
          `${choice.lot.provider.toUpperCase()} parking ${choice.lot.tie.replace('_', ' ')}: ${String(choice.lot.attributes.Area_Name ?? choice.lot.attributes.fname ?? '')}`,
          choice.lot.url, [choice.note, ...refused.map((r) => `refused ${r}`)].join('; '), choice.lot.at);
        const info = choice.lot.provider === 'mdc' ? mdcParkingInfo(choice.lot.attributes) : null;
        if (info && !ap.parking_info) push('parking_info', null, info, choice.confidence, 'MDC Parking Lots layer', choice.lot.url);
      } else if (refused.some((r) => r.includes('opposite bank'))) {
        // Only the far-bank refusal is worth a look: a lot that close to the launch
        // or nearer another place is refused correctly and silently.
        push('driving_pin', null, null, 'flag', 'agency lot refused: opposite bank', '', refused.join('; '));
      }
    }

    // ── USFS recreation site ────────────────────────────────────────────────
    const site = usfsSites.features
      .map((f) => ({ f, m: metersBetween(pin, at(f)) }))
      .filter((s) => s.m <= USFS_SITE_RADIUS_M)
      .sort((a, b) => a.m - b.m)[0] ?? null;
    const siteName = site ? String(site.f.attributes.public_site_name ?? site.f.attributes.site_name ?? '') : '';
    const siteUrl = site ? featureUrl(SOURCES.usfsSites.url, site.f.attributes.objectid) : '';
    const siteConf: Confidence = site && site.m <= 150 ? 'medium' : 'low';
    if (site) {
      evidence[`usfs-site-${site.f.attributes.site_cn}`] = site.f.attributes;
      const link = String(site.f.attributes.usda_portal_url ?? site.f.attributes.rec1stop_url ?? '').trim();
      if (link && !ap.official_site_url) {
        push('official_site_url', null, link, siteConf, `USFS site "${siteName}" (${site.f.attributes.site_subtype})`, siteUrl, `${Math.round(site.m)} m from launch`);
      }
      const fee = usfsFeeRequired(site.f.attributes.fee_charged);
      if (fee !== null && ap.fee_required == null) {
        push('fee_required', null, fee, siteConf, `USFS site "${siteName}" fee_charged=${site.f.attributes.fee_charged}`, siteUrl,
          String(site.f.attributes.fee_description ?? ''));
      }
    }

    // ── Amenities (additions only) ──────────────────────────────────────────
    const add: { a: string; why: string; url: string }[] = [];
    if (lotChosen || linked.some((s) => s.source_type === 'Parking Area')) add.push({ a: 'parking', why: 'agency parking feature', url: lots[0]?.url ?? '' });
    if (linked.some((s) => s.provider === 'mdc' && s.source_type === 'Boat Ramps')) add.push({ a: 'boat_ramp', why: 'MDC Boat Ramps layer', url: linked.find((s) => s.provider === 'mdc')!.source_feature_url });
    const privy = mdcNear(mdcPrivies, AMENITY_RADIUS_M)[0];
    if (privy) add.push({ a: 'restrooms', why: 'MDC privy, same area', url: featureUrl(SOURCES.mdcPrivies.url, privy.attributes.OBJECTID) });
    const camp = mdcNear(mdcCamping, AMENITY_RADIUS_M)[0];
    if (camp) add.push({ a: 'camping', why: `MDC camping site (${camp.attributes.Type ?? 'type n/a'}), same area`, url: featureUrl(SOURCES.mdcCamping.url, camp.attributes.OBJECTID) });
    const agfcRest = agfcNear(['Restroom'], AMENITY_RADIUS_M)[0];
    if (agfcRest) add.push({ a: 'restrooms', why: 'AGFC Restroom', url: agfcRest.source_feature_url });
    const agfcCamp = agfcNear(['RVs Allowed - No Hookups', 'RVs Allowed - Hookups and Dump', 'RVs Allowed - Hookups', 'Tents Only'], AMENITY_RADIUS_M)[0];
    if (agfcCamp) add.push({ a: 'camping', why: `AGFC ${agfcCamp.source_type}`, url: agfcCamp.source_feature_url });
    const agfcPicnic = agfcNear(['Picnic Area', 'Pavillion'], AMENITY_RADIUS_M)[0];
    if (agfcPicnic) add.push({ a: 'picnic', why: `AGFC ${agfcPicnic.source_type}`, url: agfcPicnic.source_feature_url });
    if (site && site.m <= 150 && usfsHasRestroom(site.f.attributes.restroom_availability)) {
      add.push({ a: 'restrooms', why: `USFS "${siteName}": ${site.f.attributes.restroom_availability}`, url: siteUrl });
    }
    if (site && site.m <= 150 && /CAMP/.test(String(site.f.attributes.site_subtype))) {
      add.push({ a: 'camping', why: `USFS "${siteName}" (${site.f.attributes.site_subtype})`, url: siteUrl });
    }
    const next = addAmenities(ap.amenities, add.map((x) => x.a));
    if (next) {
      const added = next.slice((ap.amenities ?? []).length);
      const why = added.map((a) => `${a}: ${add.find((x) => x.a === a)!.why}`).join(' | ');
      push('amenities', ap.amenities ?? [], next, 'medium', why, add.find((x) => added.includes(x.a))!.url);
    }

    // ── Managing agency ─────────────────────────────────────────────────────
    if (!ap.managing_agency) {
      const signals: AgencySignal[] = [];
      if (parcel && (padus?.agency || padus?.unsupported)) {
        signals.push({ ...padus!, source: 'padus', detail: `${parcel.unit_name} (${parcel.manager_name}, ${parcel.designation}${parcel.designation === 'WSR' ? ' corridor' : ''})` });
      }
      for (const s of linked) {
        if (s.provider === 'mdc') signals.push({ agency: 'MDC', source: 'agency_link', detail: `MDC ${s.source_type}: ${s.name}` });
        else {
          const o = s.owner ?? '';
          const agency = /corps|usace|\bcoe\b/i.test(o) ? 'COE' : /national park|\bnps\b/i.test(o) ? 'NPS'
            : /forest service|usfs/i.test(o) ? 'USFS' : /state park/i.test(o) ? 'State Park'
            : /\bcity\b|town of/i.test(o) ? 'Municipal' : /county/i.test(o) ? 'County' : null;
          if (agency) signals.push({ agency, source: 'agency_link', detail: `AGFC record, owner "${o}"` });
          else if (/agfc|game and fish/i.test(o) || !o) signals.push({ agency: null, unsupported: 'AGFC', source: 'agency_link', detail: `AGFC record, owner "${o || 'n/a'}"` });
        }
      }
      const fromText = agencyFromOwnershipText(ap.ownership);
      if (fromText) signals.push({ agency: fromText, source: 'ownership_text', detail: `ownership "${ap.ownership}"` });
      if (signals.length) {
        const pick = chooseManagingAgency(signals);
        if (pick.agency || pick.confidence === 'flag') {
          push('managing_agency', null, pick.agency, pick.confidence, pick.evidence,
            linked[0]?.source_feature_url ?? '', parcel ? `PAD-US parcel: ${parcel.unit_name}` : '');
        }
      }
    }

    // ── Ownership spelling + contradictions ─────────────────────────────────
    const spelled = ownershipSpelling(ap.ownership);
    if (spelled) push('ownership', ap.ownership, spelled, 'high', 'spelling only', '');
    if (/^private$/i.test((ap.ownership ?? '').trim()) && padus?.agency && padus.agency !== 'Private') {
      push('ownership', ap.ownership, null, 'flag', `PAD-US: ${parcel!.unit_name} (${parcel!.manager_name})`, '', `text says private; launch is on or within 30 m of a public parcel${parcel!.designation === 'WSR' ? ' (a Wild and Scenic corridor, which can include private land)' : ''}`);
    }

    // ── Road surface from MVUM (USFS ground only) ───────────────────────────
    const usfsGround = padus?.agency === 'USFS' || /usfs/i.test(ap.ownership ?? '') || !!site;
    if (usfsGround && !(ap.road_surface?.length)) {
      counters.mvumCalls++;
      const { features } = await fetchAll(SOURCES.mvumRoads, envelopeFilter(envelope(pin, MVUM_RADIUS_M + 50)));
      const road = features
        .filter((f) => f.geometry?.paths?.length)
        .map((f) => ({ f, m: Math.min(...f.geometry!.paths!.filter((p) => p.length > 1).map((p) =>
          pointToLineDistance(point(pin), { type: 'LineString', coordinates: p } as LineString, { units: 'meters' }))) }))
        .filter((r) => r.m <= MVUM_RADIUS_M)
        .sort((a, b) => a.m - b.m)[0];
      const surface = road ? mvumRoadSurface(road.f.attributes.surfacetype, road.f.attributes.seasonal) : null;
      if (road && surface) {
        const a = road.f.attributes;
        const hcvOnly = a.passengervehicle !== 'open' && a.highclearancevehicle === 'open';
        evidence[`mvum-${a.objectid}`] = a;
        push('road_surface', ap.road_surface ?? [], surface, hcvOnly ? 'low' : 'medium',
          `MVUM road ${a.id} ${a.name ?? ''}: ${a.surfacetype}, ${a.seasonal ?? 'season n/a'}`,
          featureUrl(SOURCES.mvumRoads.url, a.objectid),
          `${Math.round(road.m)} m from launch${hcvOnly ? '; HIGH-CLEARANCE VEHICLES ONLY — add 4wd_required by hand if right' : ''}; nearest MVUM road, not necessarily the approach`);
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
    },
    evidence,
  }, null, 2)}\n`);

  const summary: Record<string, Record<Confidence, number>> = {};
  for (const p of proposals) (summary[p.field] ??= { high: 0, medium: 0, low: 0, flag: 0 })[p.confidence]++;
  console.table(summary);
  console.log(`Wrote ${proposals.length} rows to ${join(outDir, 'review.csv')}. Nothing was written to the database.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

