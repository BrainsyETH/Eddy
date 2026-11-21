#!/usr/bin/env npx tsx
/**
 * build-set.ts — writes mornings/ from production's eddy_generation_log.
 *
 * Read-only. It reads the rows named below, and each one's river from the
 * rivers table, and writes one file per morning. It was run once, on
 * 2026-11-21, to save the set; rerun it only to rebuild the same files (the
 * log keeps every row, so the output is the same unless a row is deleted).
 *
 * The choice of mornings, and why, is the list below and the README.
 *
 * Usage (from missouri-float-planner/):
 *   npx tsx scripts/research/read-replays/build-set.ts
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../../lib/db';
import { RIVER_CONTEXT_COLUMNS, riverContextFromRow, type RiverContext } from '../../../src/lib/rivers/context';
import { MORNINGS_DIR, type Morning, type MorningRecord } from './set';

/** Recorded mornings: [key, eddy_generation_log id, why]. */
const RECORDED: ReadonlyArray<[string, string, string]> = [
  // River Reads. All but r13 are the newest river prompt production recorded
  // (system_prompt_hash 6a122bc7..., 2026-11-19 22:00 to 2026-11-20 13:00 UTC).
  ['r01-james-2026-11-20', '23fcc23d-13a1-4fdc-af81-45e2c4cc29fa', 'James, named in PR #1932. Low at Galena. The original full text says rain is likely Sunday and to check back.'],
  ['r02-gasconade-2026-11-20', 'e2d9836e-7892-4427-af92-f41f3f0de8dc', 'Gasconade, named in PR #1932. Low at Hazelgreen, with a section note for the gauge.'],
  ['r03-meramec-2026-11-20', '4fb9b5dd-bff8-4e6b-a584-0abe6b9e11f3', 'Meramec, named in PR #1932. Good at Steelville while below the optimal range: a label and a comparison that pull apart.'],
  ['r04-big-river-2026-11-20', 'f2b78f5b-263c-4572-8530-126ca039ceba', 'Flowing, the highest condition production recorded in the window. High and Dangerous were never logged.'],
  ['r05-current-2026-11-20', 'fb2cfee2-34d0-4bf6-8b16-69b784adf894', 'Good at Van Buren. The river whose Reads misplaced Big Spring on 2026-11-17.'],
  ['r06-niangua-2026-11-20', 'a8662267-4c11-447a-833c-597431685beb', 'Good at Tunnel Dam. The gauge sits above Bennett Spring, which earlier Reads credited to it.'],
  ['r07-buffalo-2026-11-20', '7bb39d73-de67-4cd9-8a9d-86d97ebd99a9', 'Low at St. Joe, Arkansas: another state and a park river.'],
  ['r08-black-2026-11-20', 'a1581b72-ef64-4a5f-81f5-31687c0b761b', 'Low at Annapolis, with a section note and the elsewhere list.'],
  ['r09-courtois-2026-11-20', '3caba621-9551-4ff9-82a8-8d71a303bd8f', 'Too Low, written on a condition change (Low to Too Low). The Courtois is read from the Huzzah gauge.'],
  ['r10-big-piney-2026-11-20', '133fe79e-aaa2-4393-86ab-cca4e6066e7a', 'Sparse notes: the river and gauge blocks only, no section note and no elsewhere list. Too Low.'],
  ['r11-eleven-point-2026-11-20', 'f75425f0-d9ba-45a9-bf07-db5aa37beeea', 'Sparse notes: river and gauge blocks only. Too Low.'],
  ['r12-caddo-river-2026-11-20', '36639ba8-59ad-450e-9199-35eb42c3f025', 'Sparse notes, and outside the Ozarks proper (Ouachitas, Arkansas). Too Low.'],
  ['r13-gasconade-2026-11-17', '544376a5-cd38-4ac6-ac5b-eeb4bb5f2885', 'Earlier prompt (c262e81d...), written when the Gasconade had only the General and river blocks: the sparsest notes a named river had.'],
  ['r14-elk-2026-11-20', 'd720170c-0adb-4da1-952c-684cf5ceb3ef', 'Fallback, no_rating: the gauge reads but has no float levels. What readers got.'],
  ['r15-white-2026-11-20', '36a908b4-bfbe-4d47-9b60-37cf35a8089b', 'Fallback, no_gauge: the White has no reporting gauge. What readers got.'],
  // Gauge Reads. The newest gauge prompt recorded (55f53262...) unless noted.
  ['g01-james-07052250-2026-11-20', 'c953668a-659d-4973-8e65-4573f3ea64df', 'James near Boaz, named in PR #1932. Too Low.'],
  ['g02-gasconade-06933500-2026-11-20', 'ecaa560e-8c74-4726-b203-76dd0ac82a02', 'Gasconade at Jerome, named in PR #1932. Good.'],
  ['g03-meramec-07010350-2026-11-20', '8ff8ed5a-7cce-4bbf-92e1-5cedee65730a', 'Meramec at Cook Station, named in PR #1932. Flowing. Sparse notes: river and gauge blocks, no section.'],
  ['g04-current-07068000-2026-11-20', 'da5950c8-06fd-45ae-b79d-d1a213ccaa9e', 'Current at Doniphan. Low. The thinnest gauge notes in the window (about 1,050 characters).'],
  ['g05-buffalo-07055646-2026-11-19', 'f394602f-874e-4e2b-a06b-73329e3bc82f', 'Earlier gauge prompt (a51bff24...), when Boxley got the river block only: knowledge_blocks [river]. Too Low.'],
  ['g06-current-07064533-2026-11-19', '0a2699b1-2bb8-41bb-a3f3-5d5f0b96c1c5', 'Current above Akers on a condition change (Low), earlier gauge prompt (a51bff24...). Two section notes.'],
  ['g07-big-river-07018500-2026-11-20', '15a11edc-4c8f-4be0-9663-3fd6760058ad', 'Big River at Byrnesville. Low, with a section note.'],
  ['g08-gasconade-06934000-2026-11-20', '83b09687-f832-40b8-94d6-ab194b0205e2', 'Fallback, no_rating: Rich Fountain has no float levels. What readers got.'],
];

interface DerivedSpec {
  key: string;
  from: string;
  change: string;
  apply: (record: MorningRecord) => void;
}

const hoursBefore = (iso: string, hours: number) => new Date(Date.parse(iso) - hours * 3_600_000).toISOString();
const hoursAfter = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();

/** A flood alert in the shape generation-record.ts captures one. */
function withFloodAlert(record: MorningRecord, alert: { event: string; severity: string; headline: string; areaDesc: string; description: string }) {
  const captured = { ...alert, expires: hoursAfter(record.created_at, 24) };
  const inputs = record.inputs as { alerts?: unknown[]; facts?: { floodAlerts?: unknown[] } };
  inputs.alerts = [captured];
  // The generator hands the same alerts to buildReportFacts, which is where
  // the prompt's "lead with the alert" instruction comes from.
  if (inputs.facts) inputs.facts.floodAlerts = [captured];
}

/**
 * Production logged no flood alert and no reading older than 1.4 hours in the
 * window, so these are recorded mornings with that one input changed. The
 * alert text is written for the test. It is not an NWS product.
 */
const DERIVED: readonly DerivedSpec[] = [
  {
    key: 'd01-meramec-flood-warning',
    from: 'r03-meramec-2026-11-20',
    change: 'Adds a river Flood Warning for the Meramec at Valley Park, downstream of the reporting gauge, which reads Good.',
    apply: (r) => withFloodAlert(r, {
      event: 'Flood Warning',
      severity: 'Moderate',
      headline: 'Flood Warning issued for the Meramec River at Valley Park until further notice',
      areaDesc: 'St. Louis, MO',
      description: 'The Flood Warning continues for the Meramec River at Valley Park. Minor flooding is forecast. The river is expected to rise above flood stage this evening and fall below it tomorrow afternoon.',
    }),
  },
  {
    key: 'd02-big-river-flash-flood-warning',
    from: 'r04-big-river-2026-11-20',
    change: 'Adds a Flash Flood Warning for the counties around the Big River gauge, which reads Flowing.',
    apply: (r) => withFloodAlert(r, {
      event: 'Flash Flood Warning',
      severity: 'Severe',
      headline: 'Flash Flood Warning for Washington and Jefferson Counties until 11:00 AM CST',
      areaDesc: 'Washington, MO; Jefferson, MO',
      description: 'Thunderstorms have produced 2 to 3 inches of rain. Flash flooding of small streams and low-water crossings is ongoing or expected to begin shortly.',
    }),
  },
  {
    key: 'd03-james-stale-reading',
    from: 'r01-james-2026-11-20',
    change: 'Moves the reading time back to 9 hours before the morning, so the prompt warns that the reading is stale.',
    apply: (r) => { (r.inputs as { readingTimestamp?: string }).readingTimestamp = hoursBefore(r.created_at, 9); },
  },
  {
    key: 'd04-meramec-07010350-flood-warning',
    from: 'g03-meramec-07010350-2026-11-20',
    change: 'Adds a river Flood Warning for the Meramec near Sullivan, downstream of Cook Station, which reads Flowing.',
    apply: (r) => withFloodAlert(r, {
      event: 'Flood Warning',
      severity: 'Moderate',
      headline: 'Flood Warning issued for the Meramec River near Sullivan until further notice',
      areaDesc: 'Crawford, MO; Franklin, MO',
      description: 'The Flood Warning continues for the Meramec River near Sullivan. Minor flooding is forecast. The river is expected to crest just above flood stage tonight.',
    }),
  },
  {
    key: 'd05-gasconade-06933500-stale-reading',
    from: 'g02-gasconade-06933500-2026-11-20',
    change: 'Moves the reading time back to 8 hours before the morning, so the prompt warns that the reading is stale.',
    apply: (r) => { (r.inputs as { readingTimestamp?: string }).readingTimestamp = hoursBefore(r.created_at, 8); },
  },
];

const COLUMNS =
  'id, created_at, workload, trigger, river_slug, section_slug, usgs_site_id, condition_code, outcome, reason, contradictions, ' +
  'model_used, stop_reason, input_tokens, output_tokens, git_sha, system_prompt_hash, knowledge_hash, knowledge_blocks, ' +
  'user_prompt, inputs, raw_response, published, error_message';

/** Anything that looks like it identifies a person. River prompts should hold none. */
const PERSONAL = /[\w.+-]+@[\w-]+\.[\w.]+|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b(?:user_id|email|phone|device_token|push_token)\b/i;

async function main() {
  const supabase = getScriptClient({ script: 'read-replays-build-set', write: false });

  const ids = RECORDED.map(([, id]) => id);
  const { data, error } = await supabase.from('eddy_generation_log').select(COLUMNS).in('id', ids);
  if (error) throw new Error(error.message);
  const rows = new Map(((data ?? []) as unknown as MorningRecord[]).map((row) => [row.id, row]));
  const missing = ids.filter((id) => !rows.has(id));
  if (missing.length) throw new Error(`Rows not found: ${missing.join(', ')}`);

  const slugs = [...new Set([...rows.values()].map((row) => row.river_slug))];
  const { data: riverRows, error: riverError } = await supabase.from('rivers').select(RIVER_CONTEXT_COLUMNS).in('slug', slugs);
  if (riverError) throw new Error(riverError.message);
  const contexts = new Map<string, RiverContext>(((riverRows ?? []) as unknown[]).map((row) => {
    const ctx = riverContextFromRow(row);
    return [ctx.slug, ctx];
  }));

  const mornings: Morning[] = RECORDED.map(([key, id, why]) => {
    const record = rows.get(id)!;
    return { key, why, derived: null, record, riverContext: contexts.get(record.river_slug) ?? null };
  });
  for (const spec of DERIVED) {
    const source = mornings.find((m) => m.key === spec.from);
    if (!source) throw new Error(`${spec.key}: no morning ${spec.from}`);
    const record: MorningRecord = {
      ...structuredClone(source.record),
      // Never generated, so nothing was stored for it.
      outcome: null, reason: null, contradictions: [], model_used: null, stop_reason: null,
      input_tokens: null, output_tokens: null, user_prompt: null, raw_response: null, published: null, error_message: null,
    };
    spec.apply(record);
    mornings.push({ key: spec.key, why: spec.change, derived: { from: spec.from, change: spec.change }, record, riverContext: source.riverContext });
  }

  for (const m of mornings) {
    const text = JSON.stringify(m);
    const hit = text.match(PERSONAL);
    if (hit) throw new Error(`${m.key} holds something that looks personal: "${hit[0]}". Check it before saving.`);
  }

  rmSync(MORNINGS_DIR, { recursive: true, force: true });
  mkdirSync(MORNINGS_DIR, { recursive: true });
  for (const m of mornings) writeFileSync(join(MORNINGS_DIR, `${m.key}.json`), `${JSON.stringify(m, null, 2)}\n`);
  console.log(`Wrote ${mornings.length} mornings (${RECORDED.length} recorded, ${DERIVED.length} derived) to ${MORNINGS_DIR}`);
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
