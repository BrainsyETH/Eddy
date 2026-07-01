#!/usr/bin/env npx tsx
/**
 * Calibrate Float Times
 *
 * Compares the app's calculated float time (src/lib/calculations/floatTime.ts)
 * against published outfitter / NPS "plan for X hours" times, using the LIVE
 * segment distances the app actually serves (get_float_segment / hand-entered
 * guide miles). Reports absolute + % residuals and the systematic bias, so the
 * speed-model constants (V_base, Q_ref, TRIP_STOP_FACTOR, FLOW_EXPONENT) can be
 * tuned to real data instead of guessed. Acceptance target: median |residual| <= 10%.
 *
 * This is the residual loop referenced in docs/FLOAT_DATA_ACCURACY_AUDIT.md §4.
 * It reads only; it never writes. Run:  npx tsx scripts/calibrate-float-times.ts
 *
 * Once float_segments is populated it will also validate each stored
 * distance_miles against get_float_segment and flag divergences > 10%.
 */

import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { calculateFloatTime, DEFAULT_CANOE_SPEEDS } from '../src/lib/calculations/floatTime';
import type { ConditionCode } from '../src/types/api';

loadEnvConfig(process.cwd());

// Published ground-truth set (canoe). Times are TRIP times at NORMAL flow.
// Sources: floatmissouri.org, NPS Ozark National Scenic Riverways float estimates.
interface Reference {
  river: string;      // river slug
  putIn: string;      // access-point name (matched case-insensitively / prefix)
  takeOut: string;
  publishedLoHr: number;
  publishedHiHr: number;
  source: string;
}

const REFERENCES: Reference[] = [
  { river: 'current', putIn: 'Akers', takeOut: 'Pulltite', publishedLoHr: 4, publishedHiHr: 6, source: 'floatmissouri/NPS' },
  { river: 'current', putIn: 'Pulltite', takeOut: 'Round Spring', publishedLoHr: 3, publishedHiHr: 5, source: 'guide' },
  { river: 'current', putIn: 'Akers', takeOut: 'Round Spring', publishedLoHr: 7, publishedHiHr: 9, source: 'floatmissouri' },
  { river: 'current', putIn: 'Round Spring', takeOut: 'Two Rivers', publishedLoHr: 6, publishedHiHr: 9, source: 'guide' },
  { river: 'huzzah', putIn: 'Harpers', takeOut: 'Huzzah Valley', publishedLoHr: 3, publishedHiHr: 4, source: 'floatmissouri' },
  { river: 'huzzah', putIn: 'Blunts', takeOut: 'Butts', publishedLoHr: 3, publishedHiHr: 5, source: 'floatmissouri' },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials in environment');
  return createClient(url, key);
}

function hm(hours: number): string {
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

async function main() {
  const supabase = getSupabase();

  const { data: rivers } = await supabase.from('rivers').select('id, slug');
  const riverBySlug = new Map((rivers ?? []).map((r) => [r.slug, r.id]));

  const rows: { label: string; miles: number; pubMid: number; est: number; residualPct: number }[] = [];

  for (const ref of REFERENCES) {
    const riverId = riverBySlug.get(ref.river);
    if (!riverId) {
      console.warn(`skip: river ${ref.river} not found`);
      continue;
    }

    const { data: aps } = await supabase
      .from('access_points')
      .select('id, name')
      .eq('river_id', riverId)
      .eq('approved', true);

    const find = (needle: string) =>
      (aps ?? []).find((a) => a.name.toLowerCase().includes(needle.toLowerCase()));
    const start = find(ref.putIn);
    const end = find(ref.takeOut);
    if (!start || !end) {
      console.warn(`skip: could not match "${ref.putIn}" / "${ref.takeOut}" on ${ref.river}`);
      continue;
    }

    // Live distance exactly as the app serves it.
    const { data: seg } = await supabase.rpc('get_float_segment', {
      p_start_access_id: start.id,
      p_end_access_id: end.id,
    } as never);
    const segRow = Array.isArray(seg) ? seg[0] : null;
    const miles = segRow?.distance_miles != null ? parseFloat(String(segRow.distance_miles)) : NaN;
    if (!(miles > 0)) {
      console.warn(`skip: no distance for ${ref.putIn}→${ref.takeOut}`);
      continue;
    }

    // App estimate at "flowing" (the common optimal band), no discharge → band model.
    const est = calculateFloatTime(miles, DEFAULT_CANOE_SPEEDS, 'flowing' as ConditionCode);
    if (!est) continue;

    const pubMid = (ref.publishedLoHr + ref.publishedHiHr) / 2;
    const estHr = est.minutes / 60;
    const residualPct = ((estHr - pubMid) / pubMid) * 100;

    rows.push({
      label: `${ref.river}: ${start.name} → ${end.name}`,
      miles,
      pubMid,
      est: estHr,
      residualPct,
    });
  }

  console.log('\nFloat-time calibration (app estimate vs published trip time)\n');
  console.log('segment'.padEnd(44), 'mi'.padStart(5), 'published'.padStart(10), 'app'.padStart(8), 'residual'.padStart(10));
  for (const r of rows) {
    console.log(
      r.label.padEnd(44),
      r.miles.toFixed(1).padStart(5),
      hm(r.pubMid).padStart(10),
      hm(r.est).padStart(8),
      `${r.residualPct >= 0 ? '+' : ''}${r.residualPct.toFixed(0)}%`.padStart(10)
    );
  }

  if (rows.length) {
    const abs = rows.map((r) => Math.abs(r.residualPct)).sort((a, b) => a - b);
    const median = abs[Math.floor(abs.length / 2)];
    const meanSigned = rows.reduce((s, r) => s + r.residualPct, 0) / rows.length;
    console.log('\nmedian |residual|:', `${median.toFixed(1)}%`, '(target ≤ 10%)');
    console.log('mean signed residual:', `${meanSigned >= 0 ? '+' : ''}${meanSigned.toFixed(1)}%`,
      meanSigned < -5 ? '→ systematically SHORT (optimistic; under-plans daylight)' :
      meanSigned > 5 ? '→ systematically LONG' : '→ roughly centered');
  } else {
    console.log('No comparable segments found.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
