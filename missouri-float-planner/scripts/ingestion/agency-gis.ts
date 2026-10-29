/** Source-only normalization. It deliberately makes no public-access or launch decisions. */
export type AgencyProvider = 'mdc' | 'agfc';
export interface AgencyFeature {
  attributes: Record<string, unknown>;
  geometry: { x: number; y: number };
}
export interface AgencySnapshot {
  source: AgencyProvider;
  url: string;
  retrieved_at: string;
  count: number;
  features: AgencyFeature[];
}

export const AGENCY_SOURCES = {
  mdc: {
    url: 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17',
    fields: 'OBJECTID,Area_ID,Area_Name,ADA',
    objectId: 'OBJECTID',
  },
  agfc: {
    url: 'https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1',
    fields: 'objectid,fname,flabel,fcat,ftype,fdescrip,owner,comments,county,waterbody,wma,location,hyp_1,last_verified_date,globalid',
    objectId: 'objectid',
  },
} as const;

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeAgencySnapshot(snapshot: AgencySnapshot) {
  const source = AGENCY_SOURCES[snapshot.source];
  if (!source || snapshot.url !== source.url) throw new Error('Unrecognized agency source');
  if (!Number.isFinite(Date.parse(snapshot.retrieved_at))) throw new Error('Invalid retrieval time');
  if (!Array.isArray(snapshot.features) || snapshot.features.length !== snapshot.count || snapshot.count === 0) {
    throw new Error('Incomplete or empty agency snapshot');
  }
  const seen = new Set<string>();
  return snapshot.features.map((feature) => {
    const a = feature.attributes;
    const { x, y } = feature.geometry ?? {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
      throw new Error('Missing or invalid WGS84 source coordinate');
    }
    const oid = a[source.objectId];
    if (!Number.isSafeInteger(oid) || Number(oid) < 0) throw new Error('Invalid agency OBJECTID');
    let sourceId: string;
    if (snapshot.source === 'agfc') {
      const guid = optionalText(a.globalid)?.replace(/[{}]/g, '').toLowerCase();
      if (!guid || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(guid)) {
        throw new Error(`AGFC ${oid}: missing GlobalID`);
      }
      sourceId = guid;
    } else {
      if (!Number.isSafeInteger(a.Area_ID)) throw new Error(`MDC ${oid}: missing area ID`);
      sourceId = `${a.Area_ID}:${x.toFixed(6)},${y.toFixed(6)}`;
    }
    if (seen.has(sourceId)) throw new Error(`Duplicate source identity: ${sourceId}`);
    seen.add(sourceId);
    const verified = a.last_verified_date;
    if (verified != null && (typeof verified !== 'number' || !Number.isFinite(verified) ||
      !Number.isFinite(new Date(verified).getTime()) || verified > Date.parse(snapshot.retrieved_at))) {
      throw new Error(`Invalid agency verification time for ${sourceId}`);
    }
    const attributes = Object.fromEntries(source.fields.split(',').map((key) => [key, a[key] ?? null]));
    return {
      provider: snapshot.source,
      source_id: sourceId,
      source_object_id: String(oid),
      source_layer_url: source.url,
      source_feature_url: `${source.url}/query?objectIds=${oid}&outFields=*&outSR=4326&f=pjson`,
      name: optionalText(snapshot.source === 'mdc' ? a.Area_Name : a.fname),
      source_type: snapshot.source === 'mdc' ? 'Boat Ramps' : optionalText(a.ftype) ?? 'Unclassified',
      waterbody: optionalText(a.waterbody),
      // An MDC-listed ramp can be municipally owned. Publisher is not owner.
      owner: optionalText(a.owner),
      longitude: x,
      latitude: y,
      source_verified_at: typeof verified === 'number' ? new Date(verified).toISOString() : null,
      fetched_at: new Date(snapshot.retrieved_at).toISOString(),
      attributes,
      // access_point_id and first_seen_at are intentionally absent. A refresh
      // owns agency evidence, never the reviewed source-to-place relationship.
    };
  });
}

type Query = (params: Record<string, string>) => Promise<Record<string, unknown>>;

/** ArcGIS record limits are not pagination: fetch an ID inventory, then every batch. */
export async function downloadAgencySnapshot(
  provider: AgencyProvider,
  query: Query,
  retrievedAt = new Date().toISOString(),
): Promise<AgencySnapshot> {
  const source = AGENCY_SOURCES[provider];
  const listing = await query({ where: '1=1', returnIdsOnly: 'true', f: 'json' });
  const ids = listing.objectIds;
  if (listing.error || !Array.isArray(ids) || !ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 0) || new Set(ids).size !== ids.length) {
    throw new Error(`${provider}: invalid source ID inventory`);
  }
  ids.sort((a, b) => a - b);
  const features: AgencyFeature[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const requested = ids.slice(offset, offset + 200);
    const response = await query({
      objectIds: requested.join(','), outFields: source.fields,
      returnGeometry: 'true', outSR: '4326', f: 'json',
    });
    if (response.error || response.exceededTransferLimit || !Array.isArray(response.features)) {
      throw new Error(`${provider}: failed or truncated source response`);
    }
    const batch = response.features as AgencyFeature[];
    const received = batch.map((f) => f.attributes[source.objectId]);
    if (received.length !== requested.length || new Set(received).size !== received.length ||
      received.some((id) => !requested.includes(id))) {
      throw new Error(`${provider}: source changed during download; retry the complete snapshot`);
    }
    features.push(...batch);
  }
  const snapshot = { source: provider, url: source.url, retrieved_at: retrievedAt, count: ids.length, features };
  normalizeAgencySnapshot(snapshot);
  return snapshot;
}
