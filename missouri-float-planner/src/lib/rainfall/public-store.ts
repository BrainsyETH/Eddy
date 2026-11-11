import { gunzipSync, gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { area } from '@turf/turf';
import type { RainDetail, RainInterval } from '@shared/rainfall';
import { normalizeRain, RAIN_HOUR } from '@shared/rainfall';
import { RESEARCH_BUCKET, MAX_BYTES, hash, type Basin, type Tile } from './research-contract';
import { basinWeights, nativePixels, weightedRain } from './native-grid';
import { rainMapContext } from './map-context';
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
  const now = Date.now();
  const states = eligible.map(basin => ({ basin, hourly: new Map<string, RainInterval>(),
    totals: [] as RainDetail['totals'], shading: null as RainDetail['shading'], latest: 0,
    seen: new Set<string>(), weights: new Map<string, ReturnType<typeof basinWeights>>() }));
  // Replay the archive, not just the last capture. A missed publish or later
  // revision must recover without inventing any hours. Decode one TIFF at a time.
  for await (const capture of rainArchive(db, now, signal)) {
    const hours = capture.source_key === 'conus_QPE_01H' ? 1 : capture.source_key === 'conus_QPE_24H' ? 24 : 72;
    if (hours !== 1 && Date.parse(capture.valid_end) < now - 3 * RAIN_HOUR) continue;
    const identity = hours === 1 ? capture.valid_start : String(hours);
    const targets = states.filter(state => capture.metadata.basinIds.includes(state.basin.id) && !state.seen.has(identity));
    if (!targets.length) continue;
    const compressed = await download(db, capture.object_path);
    if (!compressed || hash(compressed) !== capture.sha256) throw new Error('Rain archive checksum mismatch');
    const tile = capture.metadata.tile;
    if (Date.parse(capture.valid_end) - Date.parse(capture.valid_start) !== hours * RAIN_HOUR) throw new Error('Rain accumulation window mismatch');
    const pixels = nativePixels(gunzipSync(compressed, { maxOutputLength: MAX_BYTES }), tile);
    for (const state of targets) {
      signal.throwIfAborted();
      const gridKey = JSON.stringify(tile);
      let weights = state.weights.get(gridKey);
      if (!weights) {
        weights = basinWeights(state.basin.geometry, tile);
        if (state.weights.size >= 4) state.weights.clear();
        state.weights.set(gridKey, weights);
      }
      const row: RainInterval = { start: new Date(capture.valid_start).toISOString(), end: new Date(capture.valid_end).toISOString(), ...weightedRain(pixels, weights) };
      state.seen.add(identity);
      state.latest = Math.max(state.latest, Date.parse(row.end));
      if (hours === 1) state.hourly.set(row.start, row);
      else state.totals.push({ ...row, hours });
      if (hours === 24 && row.inches !== null && weights.width > 0 && weights.height > 0) {
        const inside = new Set(weights.cells.map(cell => cell.index));
        state.shading = { start: row.start, end: row.end, xmin: tile.xmin + weights.left * tile.dx,
          ymax: tile.ymax - weights.top * tile.dy, dx: tile.dx, dy: tile.dy,
          width: weights.width, height: weights.height,
          inches: Array.from({ length: weights.width * weights.height }, (_, index) => {
            const source = (Math.floor(index / weights!.width) + weights!.top) * tile.width + index % weights!.width + weights!.left;
            const value = pixels[source];
            return inside.has(source) && value != null ? value / 25.4 : null;
          }) };
      }
    }
  }
  let published = 0;
  for (const { basin, hourly, totals, shading, latest } of states) {
    signal.throwIfAborted();
    if (!latest) continue;
    const approved = publicRainSite(basin.usgs_site_id)!;
    const data: RainDetail = { version: 1, siteId: basin.usgs_site_id, updatedAt: new Date(latest).toISOString(),
      status: totals.length === 2 && totals.every(row => row.inches !== null) ? 'ready' : 'partial',
      basin: { name: approved.name, gauge: approved.gauge, areaSqMi: area(basin.geometry) / 2_589_988.110336 },
      hourly: [...hourly.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(-192), totals, boundary: basin.geometry, shading, context: await rainMapContext(db, approved.riverSlug, basin.geometry) };
    const payload: Published = { basinId: basin.id, unitsEvidence: RAIN_RELEASE.unitsEvidence!, coverageEvidence: RAIN_RELEASE.coverageEvidence!, data };
    const compressed = gzipSync(JSON.stringify(payload));
    if (compressed.length > MAX_BYTES) throw new Error('Public rain view exceeds size limit');
    const { error } = await db.storage.from(RESEARCH_BUCKET).upload(key(basin.usgs_site_id), compressed, { contentType: 'application/gzip', upsert: true });
    if (error) throw error;
    published++;
  }
  return published;
}

interface ArchiveRow {
  id: string; source_key: string; valid_start: string; valid_end: string;
  metadata: { tile: Tile; basinIds: string[] }; object_path: string; sha256: string;
}
/** Stable pages include revisions; newest fetch wins separately for each basin.
 * Snapshot the upper bound so concurrent collector writes cannot shift pages. */
export async function* rainArchive(db: SupabaseClient, now: number, signal: AbortSignal): AsyncGenerator<ArchiveRow> {
  const pageSize = 250;
  for (let offset = 0; offset < 4000; offset += pageSize) {
    signal.throwIfAborted();
    const { data, error } = await db.from('rainfall_research_captures')
      .select('id,source_key,valid_start,valid_end,metadata,object_path,sha256')
      .eq('kind', 'mrms').in('source_key', ['conus_QPE_01H', 'conus_QPE_24H', 'conus_QPE_72H'])
      .gte('valid_end', new Date(now - 8 * 24 * RAIN_HOUR).toISOString())
      .lte('valid_end', new Date(now).toISOString()).lte('fetched_at', new Date(now).toISOString())
      .order('valid_end', { ascending: false }).order('fetched_at', { ascending: false }).order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of (data ?? []) as ArchiveRow[]) yield row;
    if ((data?.length ?? 0) < pageSize) return;
  }
  throw new Error('Rain replay exceeds bounded page budget');
}
