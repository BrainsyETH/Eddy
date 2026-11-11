import { gunzipSync, gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { area } from '@turf/turf';
import type { RainDetail, RainInterval } from '@shared/rainfall';
import { normalizeRain, RAIN_HOUR } from '@shared/rainfall';
import { RESEARCH_BUCKET, MAX_BYTES, hash, type Basin, type Tile } from './research-contract';
import { basinWeights, nativePixels, weightedRain } from './native-grid';
import { publicRainSite, RAIN_RELEASE } from './public-policy';

interface Published { basinId: string; unitsEvidence: string; coverageEvidence: string; data: RainDetail }
const key = (siteId: string) => `published/v1/${siteId}.json.gz`;
async function download(db: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const result = await db.storage.from(RESEARCH_BUCKET).download(path);
  if (result.error) {
    if (('statusCode' in result.error && String(result.error.statusCode) === '404') || result.error.message === 'Object not found') return null;
    throw result.error;
  }
  if (!result.data || result.data.size > MAX_BYTES) throw new Error('Rain archive exceeds size limit');
  return new Uint8Array(await result.data.arrayBuffer());
}
export async function readPublishedRain(db: SupabaseClient, siteId: string): Promise<RainDetail | null> {
  const approved = publicRainSite(siteId);
  if (!approved) return null;
  const { data: basin, error } = await db.from('rainfall_research_basins').select('id')
    .eq('id', approved.basinId).eq('usgs_site_id', siteId).eq('enabled', true).eq('review_status', 'reviewed').maybeSingle();
  if (error) throw error;
  if (!basin) return null;
  const bytes = await download(db, key(siteId));
  if (!bytes) return null;
  const stored = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_BYTES }).toString()) as Published;
  const summary = normalizeRain(stored.data, siteId);
  if (!summary || stored.basinId !== approved.basinId || stored.unitsEvidence !== RAIN_RELEASE.unitsEvidence
    || stored.coverageEvidence !== RAIN_RELEASE.coverageEvidence) return null;
  return { ...stored.data, ...summary, shading: summary.status === 'unavailable' ? null : stored.data.shading };
}

/** Runs only for reviewed public sites, after archival succeeds. Research
 * remains immutable; these derived, disposable views live in the same private
 * bucket and are exposed solely through the validated public route. */
export async function publishRain(db: SupabaseClient, basins: (Basin & { review_status?: string })[], signal: AbortSignal) {
  const eligible = basins.filter(b => b.review_status === 'reviewed' && publicRainSite(b.usgs_site_id)?.basinId === b.id);
  if (!eligible.length) return 0;
  const grids = new Map<number, { start: string; end: string; tile: Tile; pixels: (number | null)[]; basinIds: string[] }>();
  for (const hours of [1, 24, 72]) {
    signal.throwIfAborted();
    const { data, error } = await db.from('rainfall_research_captures').select('valid_start,valid_end,metadata,object_path,sha256')
      .eq('kind', 'mrms').eq('source_key', `conus_QPE_${String(hours).padStart(2, '0')}H`)
      .gte('valid_end', new Date(Date.now() - 3 * RAIN_HOUR).toISOString()).order('valid_end', { ascending: false }).order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) continue;
    const compressed = await download(db, data.object_path);
    if (!compressed || hash(compressed) !== data.sha256) throw new Error('Rain archive checksum mismatch');
    const tile = data.metadata.tile as Tile;
    if (Date.parse(data.valid_end) - Date.parse(data.valid_start) !== hours * RAIN_HOUR) throw new Error('Rain accumulation window mismatch');
    grids.set(hours, { start: data.valid_start, end: data.valid_end, tile,
      basinIds: data.metadata.basinIds, pixels: nativePixels(gunzipSync(compressed, { maxOutputLength: MAX_BYTES }), tile) });
  }
  let published = 0;
  for (const basin of eligible) {
    signal.throwIfAborted();
    const approved = publicRainSite(basin.usgs_site_id)!;
    const previous = await readPublishedRain(db, basin.usgs_site_id);
    const hourly = new Map((previous?.hourly ?? []).filter(row => Date.parse(row.end) >= Date.now() - 8 * 24 * RAIN_HOUR).map(row => [row.start, row]));
    const totals: RainDetail['totals'] = [];
    let shading: RainDetail['shading'] = null;
    const weightsByGrid = new Map<string, ReturnType<typeof basinWeights>>();
    let latest = 0;
    for (const [hours, grid] of grids) {
      if (!grid.basinIds.includes(basin.id)) continue;
      const gridKey = JSON.stringify(grid.tile);
      let weights = weightsByGrid.get(gridKey);
      if (!weights) { weights = basinWeights(basin.geometry, grid.tile); weightsByGrid.set(gridKey, weights); }
      const row: RainInterval = { start: new Date(grid.start).toISOString(), end: new Date(grid.end).toISOString(), ...weightedRain(grid.pixels, weights) };
      latest = Math.max(latest, Date.parse(row.end));
      if (hours === 1) hourly.set(row.start, row);
      else totals.push({ ...row, hours: hours as 24 | 72 });
      if (hours === 24 && row.inches !== null && weights.width > 0 && weights.height > 0) {
        const inside = new Set(weights.cells.map(cell => cell.index));
        shading = { start: row.start, end: row.end, xmin: grid.tile.xmin + weights.left * grid.tile.dx,
          ymax: grid.tile.ymax - weights.top * grid.tile.dy, dx: grid.tile.dx, dy: grid.tile.dy,
          width: weights.width, height: weights.height,
          inches: Array.from({ length: weights.width * weights.height }, (_, index) => {
            const source = (Math.floor(index / weights!.width) + weights!.top) * grid.tile.width + index % weights!.width + weights!.left;
            const value = grid.pixels[source];
            return inside.has(source) && value != null ? value / 25.4 : null;
          }) };
      }
    }
    if (!latest) continue;
    const data: RainDetail = { version: 1, siteId: basin.usgs_site_id, updatedAt: new Date(latest).toISOString(),
      status: totals.length === 2 && totals.every(row => row.inches !== null) ? 'ready' : 'partial',
      basin: { name: approved.name, gauge: approved.gauge, areaSqMi: area(basin.geometry) / 2_589_988.110336 },
      hourly: [...hourly.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(-192), totals, boundary: basin.geometry, shading };
    const payload: Published = { basinId: basin.id, unitsEvidence: RAIN_RELEASE.unitsEvidence!, coverageEvidence: RAIN_RELEASE.coverageEvidence!, data };
    const compressed = gzipSync(JSON.stringify(payload));
    if (compressed.length > MAX_BYTES) throw new Error('Public rain view exceeds size limit');
    const { error } = await db.storage.from(RESEARCH_BUCKET).upload(key(basin.usgs_site_id), compressed, { contentType: 'application/gzip', upsert: true });
    if (error) throw error;
    published++;
  }
  return published;
}
