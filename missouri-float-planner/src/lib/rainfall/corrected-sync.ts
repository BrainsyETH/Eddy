import type { SupabaseClient } from '@supabase/supabase-js';
import { RAIN_HOUR } from '@shared/rainfall';
import { CORRECTED_PRODUCTS, correctedTile, correctedUrl, tileTiff, type CorrectedHours } from './corrected-source';
import type { Tile } from './research-contract';
import type { Capture } from './research-store';

interface Input {
  basinIds: string[]; basinSetHash: string; now: number;
  /** The tile the hosted captures use this run; when that source is down, the last archived one. */
  tile: Tile | null;
  /** How far back to look for hours not yet archived, and how many to take in one run. */
  lookbackHours?: number; maxHourly?: number;
}
type Fetch = (url: string, signal: AbortSignal) => Promise<Uint8Array>;
type Archive = (capture: Omit<Capture, 'basinSetHash'>) => Promise<void>;
const unpublished = (error: unknown) => error instanceof Error && /HTTP 404$/.test(error.message);

/**
 * Archive NOAA's gauge-corrected rainfall on the collector's tile.
 *
 * NOAA keeps every hour, so a run takes whichever recent hours are not yet
 * archived, not only the latest: a failed run or a late file is made up on the
 * next one instead of leaving a hole in the hourly bars. A file that is not
 * published yet is not a failure. The run is stale when the newest archived
 * hour is more than three hours old, which is when the public view stops
 * calling itself current.
 */
export async function collectCorrected(db: SupabaseClient, input: Input, signal: AbortSignal, bytes: Fetch, archive: Archive) {
  const top = Math.floor(input.now / RAIN_HOUR) * RAIN_HOUR, lookback = input.lookbackHours ?? 12;
  const keys = Object.values(CORRECTED_PRODUCTS).map(product => product.key);
  let tile = input.tile;
  if (!tile) {
    const last = await db.from('rainfall_research_captures').select('metadata').eq('kind', 'mrms').eq('basin_set_hash', input.basinSetHash)
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw last.error;
    tile = (last.data?.metadata as { tile?: Tile } | undefined)?.tile ?? null;
    if (!tile) throw new Error('No archived tile for this basin set');
  }
  const have = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    signal.throwIfAborted();
    const { data, error } = await db.from('rainfall_research_captures').select('source_key,valid_end').eq('kind', 'mrms')
      .eq('basin_set_hash', input.basinSetHash).in('source_key', keys)
      .gte('valid_end', new Date(top - lookback * RAIN_HOUR).toISOString()).order('valid_end').order('id').range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) have.add(`${row.source_key}|${new Date(row.valid_end).toISOString()}`);
    if ((data?.length ?? 0) < 1000) break;
    if (offset >= 9000) throw new Error('Corrected rainfall inventory exceeds bounded page budget');
  }
  let completed = 0, failed = 0, pending = 0, newest = 0;
  const take = async (hours: CorrectedHours, at: number): Promise<'have' | 'saved' | 'unpublished' | 'failed'> => {
    const end = new Date(at).toISOString(), key = CORRECTED_PRODUCTS[hours].key;
    if (have.has(`${key}|${end}`)) return 'have';
    const sourceUrl = correctedUrl(hours, end);
    try {
      signal.throwIfAborted();
      const { values, missing, source } = correctedTile(await bytes(sourceUrl, signal), hours, end, tile);
      await archive({ kind: 'mrms', sourceKey: key, start: new Date(at - hours * RAIN_HOUR).toISOString(), end,
        metadata: { basinIds: input.basinIds, tile, product: key, sourceUrl, source, missingCells: missing, unit: 'mm',
          quality: 'gauge-corrected (MRMS multi-sensor pass 2)', resampling: 'source cell under each tile cell centre',
          missingValues: 'NaN where NOAA reports missing or no coverage', format: 'GeoTIFF' }, bytes: tileTiff(values, tile) });
      return 'saved';
    } catch (error) {
      signal.throwIfAborted();
      if (unpublished(error)) return 'unpublished';
      console.warn('[rainfall-research] Corrected rainfall capture failed', key, end, error instanceof Error ? error.message : 'Database or storage error');
      return 'failed';
    }
  };
  // Hourly bars: newest first, so a long catch-up never delays the current hour.
  let budget = input.maxHourly ?? 6;
  for (let age = 0; age < lookback; age++) {
    const at = top - age * RAIN_HOUR, archived = have.has(`${CORRECTED_PRODUCTS[1].key}|${new Date(at).toISOString()}`);
    if (!archived && budget <= 0) continue;
    const result = archived ? 'have' : await take(1, at);
    if (result === 'have' || result === 'saved') newest = Math.max(newest, at);
    if (result === 'saved') { completed++; budget--; }
    else if (result === 'failed') { failed++; budget--; }
    // NOAA publishes about an hour after the hour; older than that is a gap at the source.
    else if (result === 'unpublished' && age > 1) pending++;
  }
  // Rolling totals: only the newest published one is ever shown.
  for (const hours of [24, 72] as const) for (let age = 0; age < 4; age++) {
    const result = await take(hours, top - age * RAIN_HOUR);
    if (result === 'unpublished') continue;
    if (result === 'saved') completed++; else if (result === 'failed') failed++;
    break;
  }
  return { completed, failed, pending, stale: newest < input.now - 3 * RAIN_HOUR ? 1 : 0 };
}
