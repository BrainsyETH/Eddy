import type { SupabaseClient } from '@supabase/supabase-js';
import { MRMS_URL, RAIN_WINDOWS, rasterGrid, selectMrmsRaster } from './source-contract';
import { type Basin, exportParameters, forecastMetadata, forecastUrl, hash, nativeTile, object, RESEARCH_BUCKET, validateTiff } from './research-contract';
import { type Capture, saveCapture } from './research-store';
import { publishRain } from './public-store';

type Dependencies = {
  json: (url: string, signal: AbortSignal) => Promise<unknown>;
  bytes: (url: string, signal: AbortSignal) => Promise<Uint8Array>;
  save?: (db: SupabaseClient, capture: Capture) => Promise<number>;
};
const catalogUrl = `${MRMS_URL}/query?f=json&where=1%3D1&outFields=*&returnGeometry=false`;
const jsonBytes = (data: unknown) => Buffer.from(JSON.stringify(data));

export async function pool<T>(items: T[], signal: AbortSignal, run: (item: T) => Promise<void>) {
  let next = 0, completed = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length && !signal.aborted) {
      const item = items[next++];
      try { await run(item); completed++; } catch (error) {
        failed++;
        console.warn('[rainfall-research] Source capture failed', error instanceof Error ? error.message : 'Database or storage error');
      }
    }
  }));
  return { completed, failed, deferred: items.length - next };
}

export async function collectResearch(db: SupabaseClient, mode: 'observations' | 'forecasts', signal: AbortSignal, deps: Dependencies) {
  const save = deps.save ?? saveCapture;
  const { data, error } = await db.from('rainfall_research_basins').select('*').eq('enabled', true).order('id').limit(101);
  if (error) throw error;
  const basins = data as Basin[] | null;
  if (!basins?.length || basins.length > 100) throw new Error('Research basin inventory missing or too large');
  const bucket = await db.storage.getBucket(RESEARCH_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error('Private research storage unavailable');
  const basinIds = basins.map(b => b.id);
  const basinSetHash = hash(JSON.stringify(basinIds));
  let bytesSaved = 0;
  const archive = async (c: Omit<Capture, 'basinSetHash'>) => {
    signal.throwIfAborted();
    bytesSaved += await save(db, { ...c, basinSetHash });
  };
  await archive({ kind: 'basins', sourceKey: basinSetHash, metadata: { basinIds, publicUse: false }, bytes: jsonBytes(basins) });
  let failed = 0, completed = 0, deferred = 0, stale = 0, publishedBasins = 0;
  if (mode === 'observations') {
    // Keep a replayable copy of the gauge record known at collection time.
    // Page explicitly: the hosted API's default 1,000-row limit is not completeness.
    try {
      const end = new Date().toISOString(), start = new Date(Date.now() - 48 * 3600_000).toISOString();
      const readings: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        signal.throwIfAborted();
        const result = await db.from('gauge_readings').select('id,gauge_station_id,reading_timestamp,gauge_height_ft,discharge_cfs,qualifiers,fetched_at')
          .in('gauge_station_id', basins.map(b => b.gauge_id)).gte('reading_timestamp', start).lte('reading_timestamp', end)
          .order('reading_timestamp').order('id').range(offset, offset + 999);
        if (result.error) throw result.error;
        readings.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) break;
        if (readings.length >= 50_000) throw new Error('Gauge archive exceeds bounded page budget');
      }
      const present = new Set(readings.map(r => String(object(r).gauge_station_id)));
      const missing = basins.filter(b => !present.has(b.gauge_id)).map(b => b.usgs_site_id);
      await archive({ kind: 'gauges', sourceKey: 'gauge_readings', start, end,
        metadata: { basinIds, rowCount: readings.length, missingSites: missing, publicUse: false }, bytes: jsonBytes(readings) });
      completed++;
      if (missing.length) failed++;
    } catch { failed++; }

    // Keep each product's own timestamp. Never add overlapping 6/24/72h totals.
    const metadata = await deps.json(`${MRMS_URL}?f=json`, signal);
    const catalog = await deps.json(catalogUrl, signal);
    const result = await pool([...RAIN_WINDOWS], signal, async hours => {
      const raster = selectMrmsRaster(metadata, catalog, hours, Date.now());
      const info = await deps.json(`${MRMS_URL}/${raster.rasterId}/info?f=json`, signal);
      const grid = rasterGrid(info), tile = nativeTile(basins, grid), parameters = exportParameters(tile, raster);
      // Stream the requested TIFF directly: NOAA's JSON href can point at an
      // unavailable output directory. Actual tags below still prove the grid.
      const tiff = await deps.bytes(`${MRMS_URL}/exportImage?${parameters}`, signal);
      validateTiff(tiff, tile);
      // Catalog IDs can rotate while downloading. Do not label bytes with an old time.
      const after = selectMrmsRaster(metadata, await deps.json(catalogUrl, signal), hours, Date.now());
      if (after.rasterId !== raster.rasterId || after.end !== raster.end) throw new Error('MRMS changed during capture');
      await archive({ kind: 'mrms', sourceKey: raster.subset, start: raster.start, end: raster.end,
        metadata: { basinIds, raster, grid, tile, parameters: Object.fromEntries(parameters),
          sourceInfo: info, sourceCatalog: catalog, publicUse: false,
          quality: 'research_unverified', negativeValues: 'preserved; mask before any aggregation', format: 'GeoTIFF' }, bytes: tiff });
      if (raster.stale) stale++;
    });
    completed += result.completed; failed += result.failed; deferred += result.deferred;
  } else {
    const points = new Map<string, { coordinates: number[]; basinIds: string[] }>();
    for (const basin of basins) for (const coordinates of basin.forecast_points) {
      const key = coordinates.map(n => n.toFixed(6)).join(',');
      const previous = points.get(key);
      if (previous) previous.basinIds.push(basin.id);
      else points.set(key, { coordinates, basinIds: [basin.id] });
    }
    const grids = new Map<string, Array<{ point: number[]; basinIds: string[] }>>();
    const resolution = await pool([...points], signal, async ([key, sample]) => {
      const cached = await db.from('rainfall_research_grid_cache').select('grid_url,resolved_at').eq('point_key', key).maybeSingle();
      if (cached.error) throw cached.error;
      let url: string;
      if (cached.data && Date.now() - Date.parse(cached.data.resolved_at) < 7 * 86400_000) url = forecastUrl(cached.data.grid_url);
      else {
        const response = await deps.json(`https://api.weather.gov/points/${sample.coordinates[1].toFixed(6)},${sample.coordinates[0].toFixed(6)}`, signal);
        url = forecastUrl(object(object(response).properties).forecastGridData);
        const { error: writeError } = await db.from('rainfall_research_grid_cache').upsert({ point_key: key, grid_url: url, resolved_at: new Date().toISOString() });
        if (writeError) throw writeError;
      }
      const bindings = grids.get(url) ?? [];
      bindings.push({ point: sample.coordinates, basinIds: sample.basinIds });
      grids.set(url, bindings);
    });
    failed += resolution.failed; deferred += resolution.deferred;
    const captures = await pool([...grids].sort(([a], [b]) => a.localeCompare(b)), signal, async ([url, bindings]) => {
      const response = await deps.json(url, signal), forecast = forecastMetadata(response, Date.now());
      const p = object(object(response).properties);
      if (forecastUrl(`https://api.weather.gov/gridpoints/${p.gridId}/${p.gridX},${p.gridY}`) !== url) throw new Error('NWS grid identity mismatch');
      bindings.sort((a, b) => a.point.join(',').localeCompare(b.point.join(',')));
      await archive({ kind: 'nws', sourceKey: url, start: forecast.start, end: forecast.end, issuedAt: forecast.issuedAt,
        metadata: { ...forecast, bindings, publicUse: false, sampling: 'exploratory; no basin average or coverage claim' }, bytes: jsonBytes(response) });
      if (forecast.stale) stale++;
    });
    completed += captures.completed; failed += captures.failed; deferred += captures.deferred;
  }
  // Publishing is separately gated by evidence and reviewed basin versions.
  // It cannot turn research-only captures into public amounts by itself.
  if (mode === 'observations') {
    try {
      const result = await publishRain(db, basins, signal);
      publishedBasins = result.published;
      failed += result.failures.length;
      for (const failure of result.failures) console.warn('[rainfall-research] Basin publication failed', failure.siteId, failure.reason);
    }
    catch { failed++; console.warn('[rainfall-research] Public rain view unavailable'); }
  }
  return { monitoring_status: failed || deferred || stale ? 'partial' : 'ok', completed, failed, deferred, stale, bytesSaved, basins: basins.length, publishedBasins };
}
