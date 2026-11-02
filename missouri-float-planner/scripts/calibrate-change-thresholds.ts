#!/usr/bin/env npx tsx
/**
 * Evidence for the Change view's flow thresholds — READ-ONLY.
 *
 * Reads the newest recorded national frame and the frames 6 h and 24 h before
 * it (national_map_frames), plus gauge drainage areas (gauge_stations), and
 * prints the distribution of discharge ratios by river size with the share of
 * gauges each provisional threshold would mark (src/lib/national-map/
 * change-calibration.ts). Writes nothing to the database.
 *
 * Run it on more than one day — a quiet day and a wet one — before changing
 * CHANGE_THRESHOLDS, and record the result and date in
 * docs/national-river-map.md (Change → calibration).
 *
 * Usage:
 *   EXPECTED_SUPABASE_REF=<ref> npx tsx scripts/calibrate-change-thresholds.ts [--out report.md]
 */

import { writeFileSync } from 'node:fs';
import { getScriptClient } from './lib/db';
import { calibrationMarkdown } from '../src/lib/national-map/change-calibration';
import { WINDOW_MIN_SHARE, WINDOW_MS, type ChangeWindow } from '../src/lib/national-map/change';
import { decodeFrame, type DecodedFrame } from '../src/lib/national-map/frame';

async function main() {
  const supabase = getScriptClient({ script: 'calibrate-change-thresholds', write: false });
  const frameAtOrBefore = async (iso: string | null): Promise<DecodedFrame | null> => {
    let q = supabase.from('national_map_frames').select('captured_at, body').order('captured_at', { ascending: false }).limit(1);
    if (iso) q = q.lte('captured_at', iso);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const row = data?.[0] as { body: unknown } | undefined;
    return row ? decodeFrame(row.body) : null;
  };

  const now = await frameAtOrBefore(null);
  if (!now) throw new Error('No recorded frames yet.');

  // Drainage area by USGS site, paged (the national inventory is ~14k rows).
  const drainage = new Map<string, number | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('gauge_stations')
      .select('usgs_site_id, drainage_area_sqmi')
      .not('usgs_site_id', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ usgs_site_id: string; drainage_area_sqmi: number | null }>) {
      drainage.set(r.usgs_site_id, r.drainage_area_sqmi);
    }
    if (!data || data.length < 1000) break;
  }

  const sections = [`# Change threshold calibration — ${new Date(now.capturedAt).toISOString()}`, ''];
  for (const window of ['6h', '24h'] as ChangeWindow[]) {
    const then = await frameAtOrBefore(new Date(now.capturedAt - WINDOW_MS[window]).toISOString());
    if (!then || now.capturedAt - then.capturedAt < WINDOW_MS[window] * WINDOW_MIN_SHARE) {
      sections.push(`### ${window} window — not enough recorded history yet`, '');
      continue;
    }
    sections.push(calibrationMarkdown(window, now, then, drainage), '');
  }
  const report = sections.join('\n');
  const outArg = process.argv.indexOf('--out');
  if (outArg > -1 && process.argv[outArg + 1]) writeFileSync(process.argv[outArg + 1], report);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
