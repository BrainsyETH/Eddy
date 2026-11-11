/** Inspection only. Nothing here approves a basin or converts MRMS values to inches. */
import { area, booleanValid, distance, kinks, point } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

export const MRMS_URL = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer';
export const NLDI_URL = 'https://api.water.usgs.gov/nldi/linked-data/nwissite';
export const RAIN_WINDOWS = [1, 6, 24, 72] as const;
export type RainWindow = typeof RAIN_WINDOWS[number];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
export function siteId(value: string): string {
  if (!/^\d{8,15}$/.test(value)) throw new Error(`Invalid USGS site ID: ${value}`);
  return value;
}
function position(value: unknown): Position {
  if (!Array.isArray(value) || value.length < 2 || !finite(value[0]) || !finite(value[1])
    || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Invalid WGS84 position');
  return [value[0], value[1]];
}
function feature(value: unknown): Record<string, unknown> {
  const collection = object(value);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)
    || collection.features.length !== 1) throw new Error('Expected exactly one source feature');
  const item = object(collection.features[0]);
  if (item.type !== 'Feature') throw new Error('Expected a GeoJSON feature');
  return item;
}
function parseBasin(value: unknown): Feature<MultiPolygon> {
  const geometry = object(feature(value).geometry);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length) throw new Error('Expected a nonempty basin polygon');
  const coordinates = polygons.map((polygon) => {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty polygon');
    return polygon.map((ring) => {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('Invalid ring');
      const points = ring.map(position);
      if (points[0][0] !== points.at(-1)![0] || points[0][1] !== points.at(-1)![1]) throw new Error('Open polygon ring');
      return points;
    });
  });
  const basin: Feature<MultiPolygon> = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates } };
  return basin;
}
function validBasin(basin: Feature<MultiPolygon>): boolean {
  return booleanValid(basin) && kinks(basin).features.length === 0 && area(basin) > 0;
}
export function decodeBasin(value: unknown): Feature<MultiPolygon> {
  const basin = parseBasin(value);
  if (!validBasin(basin)) throw new Error('Invalid basin geometry');
  return basin;
}

export function inspectBasin(input: {
  site: string; basin: unknown; nldiSite: unknown; usgsSite: unknown;
  storedAreaSqmi?: number | null; storedLocation?: Position | null;
}) {
  const id = `USGS-${siteId(input.site)}`;
  const nldi = feature(input.nldiSite);
  const usgs = feature(input.usgsSite);
  const nldiProperties = object(nldi.properties);
  const usgsProperties = object(usgs.properties);
  if (nldiProperties.identifier !== id || usgsProperties.id !== id) throw new Error('Source site identity mismatch');
  const nldiGeometry = object(nldi.geometry);
  const usgsGeometry = object(usgs.geometry);
  if (nldiGeometry.type !== 'Point' || usgsGeometry.type !== 'Point') throw new Error('Expected source station points');
  const nldiPoint = position(nldiGeometry.coordinates);
  const usgsPoint = position(usgsGeometry.coordinates);
  // Geometry failure must not discard independently useful station evidence.
  let basin: Feature<MultiPolygon> | null = null;
  let basinAreaSqmi: number | null = null;
  let geometryError: string | null = null;
  try {
    const parsed = parseBasin(input.basin);
    const measuredArea = area(parsed) / 2_589_988.110336;
    if (Number.isFinite(measuredArea) && measuredArea > 0) basinAreaSqmi = measuredArea;
    if (validBasin(parsed)) basin = parsed;
    else geometryError = 'Invalid basin geometry';
  } catch (error) {
    geometryError = error instanceof Error ? error.message : String(error);
  }
  const rawArea = usgsProperties.drainage_area;
  const sourceAreaSqmi = finite(rawArea) && rawArea > 0 ? rawArea : null;
  const differenceFraction = sourceAreaSqmi == null || basinAreaSqmi == null ? null : (basinAreaSqmi - sourceAreaSqmi) / sourceAreaSqmi;
  const sourcePointDistanceM = distance(point(nldiPoint), point(usgsPoint), { units: 'meters' });
  const storedPointDistanceM = input.storedLocation == null ? null
    : distance(point(position(input.storedLocation)), point(usgsPoint), { units: 'meters' });
  const issues: string[] = [];
  if (geometryError) issues.push('invalid_geometry');
  if (sourceAreaSqmi == null) issues.push('source_area_missing');
  if (differenceFraction != null && Math.abs(differenceFraction) > 0.1) issues.push('basin_area_mismatch');
  // A triage threshold, not a claim about the precision of every gauge.
  if (sourcePointDistanceM > 100) issues.push('source_point_mismatch');
  if (storedPointDistanceM != null && storedPointDistanceM > 100) issues.push('stored_point_mismatch');
  if (input.storedAreaSqmi == null) issues.push('stored_area_missing');
  else if (sourceAreaSqmi != null && Math.abs(input.storedAreaSqmi - sourceAreaSqmi) / sourceAreaSqmi > 0.01) issues.push('stored_area_mismatch');
  return {
    site: input.site, basinAreaSqmi, sourceAreaSqmi, differenceFraction,
    sourcePointDistanceM, storedPointDistanceM, issues,
    geometryValid: basin !== null, geometryError,
    // An invalid polygon's area is diagnostic only, never a usable boundary.
    areaIsDiagnostic: basin === null,
    // Area agreement does not validate the full boundary or spring recharge.
    reviewStatus: 'unreviewed' as const,
    sourceName: usgsProperties.monitoring_location_name,
    basin,
  };
}

export function selectMrmsRaster(metadataValue: unknown, catalogValue: unknown, hours: RainWindow, now: number) {
  const metadata = object(metadataValue);
  if (metadata.pixelType !== 'F32' || metadata.bandCount !== 1) throw new Error('MRMS pixel contract changed');
  if (!Array.isArray(metadata.rasterFunctionInfos)
    || !metadata.rasterFunctionInfos.some((r) => object(r).name === 'None')) throw new Error('Raw MRMS renderer unavailable');
  const catalog = object(catalogValue);
  if (catalog.exceededTransferLimit === true || !Array.isArray(catalog.features)) throw new Error('Incomplete MRMS catalog');
  const subset = `conus_QPE_${String(hours).padStart(2, '0')}H`;
  const rows = catalog.features.map((f) => object(object(f).attributes))
    .filter((r) => r.idp_subset === subset && r.category === 1);
  if (rows.length !== 1) throw new Error(`Expected one active ${subset} raster, found ${rows.length}`);
  const row = rows[0];
  if (!finite(row.objectid) || !Number.isSafeInteger(row.objectid) || row.objectid < 1
    || !finite(row.idp_validendtime) || row.idp_validendtime <= 0
    || !Number.isFinite(now) || row.idp_validendtime > now + 10 * 60_000
    || row.idp_validendtime % 3_600_000 !== 0) throw new Error('Invalid MRMS identity or valid-end time');
  return {
    rasterId: row.objectid, subset, hours,
    start: new Date(row.idp_validendtime - hours * 3_600_000).toISOString(),
    end: new Date(row.idp_validendtime).toISOString(),
    stale: now - row.idp_validendtime > 3 * 3_600_000,
    nativeUnits: 'unverified' as const,
    documentedProductUnits: 'mm' as const,
    missingValues: [-1, -3],
    renderingRule: { rasterFunction: 'None' },
    mosaicRule: { mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [row.objectid] },
  };
}

/** Read the locked item's grid, never the mosaic service's minimum pixel size. */
export function rasterGrid(value: unknown) {
  const info = object(value);
  const origin = object(info.origin);
  const extent = object(info.extent);
  const sr = object(origin.spatialReference);
  const extentSr = object(extent.spatialReference);
  const wkid = sr.latestWkid ?? sr.wkid;
  const extentWkid = extentSr.latestWkid ?? extentSr.wkid;
  if (info.pixelType !== 'F32' || info.bandCount !== 1
    || ![3857, 102100].includes(Number(wkid)) || ![3857, 102100].includes(Number(extentWkid))
    || !finite(info.pixelSizeX) || !finite(info.pixelSizeY) || info.pixelSizeX <= 0 || info.pixelSizeY <= 0
    || !finite(origin.x) || !finite(origin.y)
    || !finite(extent.xmin) || !finite(extent.xmax) || !finite(extent.ymin) || !finite(extent.ymax)
    || extent.xmin >= extent.xmax || extent.ymin >= extent.ymax) throw new Error('Invalid native raster grid');
  return {
    pixelSize: { x: info.pixelSizeX, y: info.pixelSizeY, spatialReference: { wkid: 3857 } },
    origin: { x: origin.x, y: origin.y, spatialReference: { wkid: 3857 } },
    extent: { xmin: extent.xmin, ymin: extent.ymin, xmax: extent.xmax, ymax: extent.ymax },
  };
}

/** Mask negatives at the source, then use nearest-neighbor sampling at base resolution. */
export function rawDiagnosticRule(raster: ReturnType<typeof selectMrmsRaster>, grid: ReturnType<typeof rasterGrid>) {
  return {
    rasterFunction: 'Resample', outputPixelType: 'F32',
    rasterFunctionArguments: {
      ResamplingType: 0,
      InputCellsize: { x: grid.pixelSize.x, y: grid.pixelSize.y },
      Raster: {
        rasterFunction: 'Mask', outputPixelType: 'F32',
        rasterFunctionArguments: {
          Raster: `$${raster.rasterId}`, IncludedRanges: [0, 3.4028234663852886e38], NoDataInterpretation: 0,
        },
      },
    },
  };
}

/** Diagnostic only: the server's polygon statistic is NOT an area-weighted basin total.
 * Item origin is retained for the future aligned, area-weighted collector. This endpoint
 * has no registration-point parameter, so its statistic cannot establish that gate.
 */
export function statisticsParameters(basin: Feature<Polygon | MultiPolygon>, raster: ReturnType<typeof selectMrmsRaster>, grid: ReturnType<typeof rasterGrid>, renderer: 'raw' | `rft_${number}hr` = 'raw') {
  // Esri rings use clockwise shells / counterclockwise holes.
  const polygons = basin.geometry.type === 'Polygon' ? [basin.geometry.coordinates] : basin.geometry.coordinates;
  const rings = polygons.flatMap((polygon) => polygon.map((ring, index) => {
    const signed = ring.slice(0, -1).reduce((sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0);
    return (index === 0 ? signed > 0 : signed < 0) ? [...ring].reverse() : ring;
  }));
  return new URLSearchParams({
    f: 'json', geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
    mosaicRule: JSON.stringify(raster.mosaicRule),
    renderingRule: JSON.stringify(renderer === 'raw' ? rawDiagnosticRule(raster, grid) : { rasterFunction: renderer }),
    pixelSize: JSON.stringify(grid.pixelSize),
  });
}

/** Reject an unmasked/invalid response; no samples stays unknown, never zero rain. */
export function diagnosticStatistics(value: unknown) {
  const response = object(value);
  if (!Array.isArray(response.statistics) || response.statistics.length > 1) throw new Error('Expected one diagnostic band');
  if (response.statistics.length === 0) return { validPixels: 0, mean: null, min: null, max: null };
  const stats = object(response.statistics[0]);
  if (!finite(stats.count) || !Number.isInteger(stats.count) || stats.count < 0) throw new Error('Invalid diagnostic count');
  if (stats.count === 0) return { validPixels: 0, mean: null, min: null, max: null };
  if (!finite(stats.min) || !finite(stats.max) || !finite(stats.mean)
    || stats.min < 0 || stats.max < stats.min || stats.mean < stats.min || stats.mean > stats.max) throw new Error('Invalid or unmasked diagnostic values');
  return { validPixels: stats.count, mean: stats.mean, min: stats.min, max: stats.max };
}
