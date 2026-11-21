import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildGaugeGenerationRecord, buildGenerationRecord, gaugeKnowledgeBlocks, knowledgeBlocks, sha256,
  type GaugeGenerationCapture, type GenerationCapture,
} from './generation-record';
import { getRiverKnowledgeForGauge } from './knowledge';
import { buildReportFacts, preflightFallbackReason, preflightReportFallback, prepareGeneratedReport, reportClaimsLine } from './report-facts';
import { getKnowledgeForTarget } from './knowledge';
import type { UpdateTarget } from '../../data/river-sections';

const thresholds = { thresholdUnit: 'cfs' as const, levelTooLow: 400, levelLow: 700, levelOptimalMin: 1190, levelOptimalMax: 2700, levelHigh: 2700, levelDangerous: 5000 };
const noThresholds = { levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null };
const rated = buildReportFacts({ gaugeName: 'Current River at Van Buren, MO', gaugeHeightFt: 2.57, dischargeCfs: 756, thresholds });

// ── why a report was code-written ───────────────────────────────────

test('the four pre-model fallbacks are told apart', () => {
  // Until this existed all four were just rows with no model: 110 of 178 on
  // 2026-11-16, with no way to say how many were which.
  const noGauge = buildReportFacts({ gaugeName: null, locationName: 'White River', conditionCode: 'unknown', gaugeHeightFt: null, dischargeCfs: null, thresholds: noThresholds });
  const noReading = buildReportFacts({ gaugeName: 'Elk Rv at MO-59, Noel, MO', conditionCode: 'unknown', gaugeHeightFt: null, dischargeCfs: null, thresholds });
  const noRating = buildReportFacts({ gaugeName: 'Elk Rv at MO-59, Noel, MO', conditionCode: 'unknown', gaugeHeightFt: 3.1, dischargeCfs: null, thresholds: noThresholds });
  const unsupported = buildReportFacts({ gaugeName: 'Current River at Van Buren, MO', gaugeHeightFt: 2.57, dischargeCfs: 756, thresholds, requestedSection: 'Upper Current', supportedSection: null });

  assert.equal(preflightFallbackReason(noGauge), 'no_gauge');
  assert.equal(preflightFallbackReason(noReading), 'no_reading');
  assert.equal(preflightFallbackReason(noRating), 'no_rating');
  assert.equal(preflightFallbackReason(unsupported), 'unsupported_section');
  assert.equal(preflightFallbackReason(rated), null);
});

test('a reason exists exactly when the preflight fallback does', () => {
  // The classification must not change which reports the model may write.
  const cases = [
    rated,
    buildReportFacts({ gaugeName: null, conditionCode: 'unknown', gaugeHeightFt: null, dischargeCfs: null, thresholds: noThresholds }),
    buildReportFacts({ gaugeName: 'G', gaugeHeightFt: 2, dischargeCfs: 700, thresholds, requestedSection: 'Reach', supportedSection: null }),
    buildReportFacts({ gaugeName: 'G', gaugeHeightFt: 2, dischargeCfs: 700, thresholds, requestedSection: 'Reach', supportedSection: 'Reach' }),
  ];
  for (const facts of cases) {
    assert.equal(preflightFallbackReason(facts) != null, preflightReportFallback(facts) != null);
  }
});

test('an unrated station is named ahead of an unsupported section', () => {
  const both = buildReportFacts({ gaugeName: 'G', conditionCode: 'unknown', gaugeHeightFt: 2, dischargeCfs: null, thresholds: noThresholds, requestedSection: 'Reach', supportedSection: null });
  assert.equal(preflightFallbackReason(both), 'no_rating');
});

test('the two post-model fallbacks carry their cause', () => {
  const body = (text: string) => `[SUMMARY]\n${text}\n[EDDY_READ]\n${text}\n[FULL]\n${text}`;

  const ok = prepareGeneratedReport(`${reportClaimsLine(rated)}\n${body('An easygoing float near Van Buren.')}`, rated);
  assert.deepEqual([ok.usedFallback, ok.fallbackReason, ok.contradictions], [false, null, []]);

  const wrongClaims = prepareGeneratedReport(`[CLAIMS] condition=flowing relation=within\n${body('An easygoing float near Van Buren.')}`, rated);
  assert.deepEqual([wrongClaims.usedFallback, wrongClaims.fallbackReason], [true, 'claims_mismatch']);

  const contradicted = prepareGeneratedReport(`${reportClaimsLine(rated)}\n${body('The river is Flowing today.')}`, rated);
  assert.equal(contradicted.fallbackReason, 'contradiction');
  assert.deepEqual(contradicted.contradictions, ['condition']);
});

// ── the record ──────────────────────────────────────────────────────

const target: UpdateTarget = {
  riverSlug: 'current', riverName: 'Current River', sectionSlug: null,
  sectionName: null, sectionDescription: null, sectionRiverType: null,
  sectionLowWaterMeaning: null, sectionRisingWaterHazards: null,
};
const capture = (over: Partial<GenerationCapture> = {}): GenerationCapture => ({
  target,
  trigger: 'scheduled',
  model: { id: 'claude-sonnet-4-6', maxTokens: 800, cacheSystemPrompt: true, source: 'default' },
  facts: rated,
  usgsSiteId: '07067000',
  readingTimestamp: '2026-11-16T11:00:00Z',
  gaugeNotes: null,
  riverCtx: null,
  alerts: [],
  weather: null,
  forecast: null,
  precipitation: null,
  trajectory: null,
  localKnowledge: '=== General Ozarks Knowledge ===\nStrainers.\n\n=== current River Knowledge ===\nSpring-fed.',
  systemPrompt: 'You are Eddy.',
  userPrompt: 'Generate an Eddy condition update for: Current River',
  ...over,
});

test('a model-written Read records its prompt, raw text and what was published', () => {
  const row = buildGenerationRecord(capture(), {
    outcome: 'model', reason: null,
    rawResponse: '[SUMMARY]\nGood float — steady.', stopReason: 'end_turn',
    usage: { inputTokens: 3190, outputTokens: 269, cacheReadTokens: 1867, cacheCreationTokens: 0 },
    published: { summaryText: 'Good float, steady.', eddyRead: 'Read.', quoteText: 'Full.', sourcesUsed: ['USGS gauge'] },
  }, { gitSha: 'abc123' });

  assert.equal(row.outcome, 'model');
  assert.equal(row.model_used, 'claude-sonnet-4-6');
  assert.equal(row.git_sha, 'abc123');
  assert.equal(row.usgs_site_id, '07067000');
  assert.equal(row.condition_code, 'good');
  // The raw text keeps the em dash the published text had cleaned out of it.
  assert.match(row.raw_response ?? '', /—/);
  assert.equal(row.published?.summaryText, 'Good float, steady.');
  assert.deepEqual(row.knowledge_blocks, ['general', 'river']);
  assert.equal(row.system_prompt_hash, sha256('You are Eddy.'));
  assert.equal(row.cache_read_tokens, 1867);
  // The structured facts ride along with their unit, separate from the prompt.
  assert.equal((row.inputs.facts as { unit: string }).unit, 'cfs');
  assert.equal(row.inputs.readingTimestamp, '2026-11-16T11:00:00Z');
});

test('a fallback decided from the facts names no model and has no prompt', () => {
  // Otherwise the fallback rate reads as a property of whichever model was
  // configured, when no model was asked anything.
  const row = buildGenerationRecord(capture({ userPrompt: null, localKnowledge: null }), {
    outcome: 'fallback', reason: 'unsupported_section',
    published: { summaryText: 'S', eddyRead: 'E', quoteText: 'Q', sourcesUsed: ['USGS gauge'] },
  });
  assert.equal(row.model_used, null);
  assert.equal(row.user_prompt, null);
  assert.equal(row.raw_response, null);
  assert.equal(row.knowledge_hash, null);
  assert.deepEqual(row.knowledge_blocks, []);
  assert.equal(row.reason, 'unsupported_section');
});

test('a guard fallback keeps the model text that was thrown away', () => {
  const row = buildGenerationRecord(capture(), {
    outcome: 'fallback', reason: 'contradiction', contradictions: ['condition'],
    rawResponse: 'The river is Flowing today.',
    published: { summaryText: 'S', eddyRead: 'E', quoteText: 'Q', sourcesUsed: [] },
  });
  assert.equal(row.model_used, 'claude-sonnet-4-6');
  assert.equal(row.raw_response, 'The river is Flowing today.');
  assert.deepEqual(row.contradictions, ['condition']);
});

test('a failed call is recorded with nothing published', () => {
  const row = buildGenerationRecord(capture(), { outcome: 'error', reason: 'model_error', errorMessage: 'x'.repeat(2000) });
  assert.equal(row.outcome, 'error');
  assert.equal(row.published, null);
  assert.equal(row.model_used, 'claude-sonnet-4-6');
  assert.equal(row.error_message?.length, 500);

  const noKey = buildGenerationRecord(capture(), { outcome: 'error', reason: 'missing_api_key' });
  assert.equal(noKey.model_used, null);
});

test('knowledge blocks are read from what was injected', () => {
  // Against the real file: a section target gets all three, a river with no
  // section in the file gets General alone.
  assert.deepEqual(
    knowledgeBlocks(getKnowledgeForTarget('bryant-creek', 'hodgson-mill-to-warren-bridge')),
    ['general', 'river', 'section:hodgson-mill-to-warren-bridge'],
  );
  assert.deepEqual(knowledgeBlocks(getKnowledgeForTarget('current', null)), ['general', 'river']);
  assert.deepEqual(knowledgeBlocks(getKnowledgeForTarget('no-such-river', null)), ['general']);
  assert.deepEqual(knowledgeBlocks(null), []);
});

// ── the record and the table ────────────────────────────────────────

test('every column the application inserts exists in the migration, and no other', () => {
  // The generator swallows a failed insert, so a column that drifted would
  // not fail anything. It would just stop keeping evidence.
  const sql = readFileSync('supabase/migrations/20261117041752_eddy_generation_log.sql', 'utf8');
  const body = sql.slice(sql.indexOf('create table public.eddy_generation_log ('), sql.indexOf('\n);'));
  const columns = [...body.matchAll(/^ {2}(\w+) /gm)].map((m) => m[1]);
  const row = buildGenerationRecord(capture(), { outcome: 'model', reason: null });

  assert.deepEqual(
    Object.keys(row).sort(),
    columns.filter((c) => c !== 'id' && c !== 'created_at').sort(),
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.eddy_generation_log from public, anon, authenticated, service_role/);
});

test('every exit from the generator writes a record, and every caller names its trigger', () => {
  const generator = readFileSync('src/lib/eddy/generate-update.ts', 'utf8');
  const fn = generator.slice(generator.indexOf('export async function generateEddyUpdate('), generator.indexOf('// The parser lives in its own SDK-free module'));
  // A null return publishes nothing, so the record is the only trace of it.
  const nullReturns = [...fn.matchAll(/return null;/g)];
  assert.equal(nullReturns.length, 3);

  // The attempts run in the shared loop (src/lib/ai/attempts.ts): the resolved
  // model, then its fallback. Each one that yields nothing records itself, in
  // the attempt or in the error handler beside it, under the model that was
  // asked: no text, an incomplete report, no API key, or a call that threw.
  const loopEnd = fn.indexOf('if (!completion) return null;');
  const attempts = fn.slice(fn.indexOf('const completion = await tryModels'), loopEnd);
  assert.ok(attempts.length > 0 && loopEnd > 0);
  for (const reason of ['empty_response', 'incomplete_response', 'missing_api_key', 'model_error']) {
    assert.match(attempts, new RegExp(`await record\\(\\{ outcome: 'error', reason: '${reason}'`));
  }
  assert.match(attempts, /capture\.model = captureModel\(attempt\);/);
  // An attempt has two ways out. Accepted, which means a WHOLE report: the
  // guard is told whether the model finished, and an incomplete answer is
  // accepted only when no other model is waiting, where the guard has already
  // replaced it with the code-written one. Or null, after a record.
  assert.equal([...attempts.matchAll(/\breturn /g)].length, 2);
  assert.match(attempts, /prepareGeneratedReport\(rawText, facts, \{ finished: result\.finished \}\)/);
  assert.match(attempts, /if \(prepared && !\(prepared\.incomplete && hasNext\)\) return \{ result, prepared \};/);
  const refused = attempts.slice(attempts.indexOf('return { result, prepared };'), attempts.indexOf('return null;'));
  assert.equal([...refused.matchAll(/await record\(\{ outcome: 'error'/g)].length, 2);

  // Then nothing came back from any model, and last, the failure to prepare a
  // report from text that did arrive.
  assert.equal(nullReturns[1].index, loopEnd + 'if (!completion) '.length);
  assert.match(fn.slice(Math.max(0, nullReturns[2].index - 260), nullReturns[2].index), /await record\(\{ outcome: 'error'/);
  assert.match(fn, /if \(fallback\) await record\(\{\s*outcome: 'fallback',\s*reason: preflightFallbackReason\(facts\)/);
  assert.match(fn, /outcome: usedFallback \? 'fallback' : 'model'/);

  const cron = readFileSync('src/app/api/cron/generate-eddy-updates/route.ts', 'utf8');
  assert.match(cron, /generateEddyUpdate\(target, models\.river_update, \{[\s\S]*?trigger: singleRiver \? 'on_demand' : 'scheduled'/);
  assert.match(cron, /await pruneGenerationLog\(supabase\)/);
  assert.match(readFileSync('src/lib/eddy/regenerate.ts', 'utf8'), /generateEddyUpdate\(target, model, \{ trigger: triggerReason \}\)/);
});

// ── gauge Reads ─────────────────────────────────────────────────────
// Secondary-gauge Reads are what a reader sees beside each gauge, and until
// 2026-11-17 only their published text was kept. They are recorded in the same
// table, told apart by `workload`.

const gaugeCapture = (over: Partial<GaugeGenerationCapture> = {}): GaugeGenerationCapture => ({
  target: { riverSlug: 'meramec', riverName: 'Meramec River', usgsSiteId: '07014500', gaugeName: 'Meramec River near Sullivan, MO', coordinates: { lat: 38.16, lon: -91.11 } },
  trigger: 'scheduled',
  model: { id: 'claude-haiku-4-5', maxTokens: 600, cacheSystemPrompt: false, source: 'default' },
  facts: buildReportFacts({ gaugeName: 'Meramec River near Sullivan, MO', gaugeHeightFt: 2.57, dischargeCfs: 756, thresholds }),
  readingTimestamp: '2026-11-17T11:00:00Z',
  alerts: [],
  forecast: null,
  trajectory: null,
  riverBehaviorApplies: true,
  riverKnowledge: 'The largest Ozarks float river by volume.\n\nSection lower-meramec:\n- Below Meramec State Park to Sullivan area.',
  systemPrompt: 'gauge system prompt',
  userPrompt: '[THIS GAUGE]\nReading: 2.57 ft',
  ...over,
});

test('a gauge Read is recorded under its own workload, by station, with the same columns', () => {
  const published = { summaryText: 'S', eddyRead: 'R', quoteText: 'Q', sourcesUsed: ['USGS gauge'] };
  const row = buildGaugeGenerationRecord(gaugeCapture(), { outcome: 'model', reason: null, rawResponse: 'raw', published }, { gitSha: 'abc' });

  assert.equal(row.workload, 'gauge_update');
  assert.deepEqual([row.river_slug, row.section_slug, row.usgs_site_id], ['meramec', null, '07014500']);
  assert.deepEqual([row.outcome, row.model_used, row.git_sha], ['model', 'claude-haiku-4-5', 'abc']);
  assert.equal(row.system_prompt_hash, sha256('gauge system prompt'));
  assert.equal(row.user_prompt, '[THIS GAUGE]\nReading: 2.57 ft');
  assert.deepEqual(row.published, published);
  assert.deepEqual(row.knowledge_blocks, ['river', 'section:lower-meramec']);
  assert.equal((row.inputs.facts as { dischargeCfs: number }).dischargeCfs, 756);
  assert.equal(row.inputs.riverBehaviorApplies, true);

  // One table, one shape: the migration test above covers the river row.
  const river = buildGenerationRecord(capture(), { outcome: 'model', reason: null });
  assert.deepEqual(Object.keys(row).sort(), Object.keys(river).sort());
});

test('a gauge fallback decided from the facts names no model', () => {
  const row = buildGaugeGenerationRecord(gaugeCapture({ userPrompt: null, riverKnowledge: null }), { outcome: 'fallback', reason: 'no_rating' });
  assert.deepEqual([row.model_used, row.user_prompt, row.knowledge_hash, row.knowledge_blocks], [null, null, null, []]);
});

test('gauge knowledge blocks are read from the text that was sent', () => {
  assert.deepEqual(gaugeKnowledgeBlocks(null), []);
  assert.deepEqual(gaugeKnowledgeBlocks('River block only.'), ['river']);
  assert.deepEqual(gaugeKnowledgeBlocks('Section upper-current:\n- Montauk.'), ['section:upper-current']);
  // The real file: Sullivan is named in both Meramec reach notes (the upper one
  // runs past the Huzzah onto its water), Eureka in none.
  assert.deepEqual(gaugeKnowledgeBlocks(getRiverKnowledgeForGauge('meramec', 'Meramec River near Sullivan, MO')), ['river', 'section:upper-meramec', 'section:lower-meramec']);
  assert.deepEqual(gaugeKnowledgeBlocks(getRiverKnowledgeForGauge('meramec', 'Meramec River near Eureka, MO')), ['river']);
});

test('every exit from the gauge generator writes a record, and every caller names its trigger', () => {
  const generator = readFileSync('src/lib/eddy/generate-gauge-update.ts', 'utf8');
  const body = generator.slice(generator.indexOf('export async function generateGaugeUpdate'), generator.indexOf('// Prompt assembly'));
  // Past the point the facts exist, a return is either a recorded early exit
  // or the recorded update.
  const afterFacts = body.slice(body.indexOf('const record = '));
  const loopStart = afterFacts.indexOf('const completion = await tryModels');
  const loopEnd = afterFacts.indexOf('if (!completion) return null;');
  assert.ok(loopStart > 0 && loopEnd > loopStart);
  const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

  // Before any model is asked: the fallback decided from the facts.
  const before = afterFacts.slice(0, loopStart);
  assert.equal(count(before, /^\s+(?:if \(fallback\) )?return\b.*$/gm), 1, 'the preflight fallback');
  assert.equal(count(before, /await record\(/g), 1);

  // The attempts, in the shared loop (src/lib/ai/attempts.ts). Each one that
  // yields nothing records itself under the model that was asked.
  const attempts = afterFacts.slice(loopStart, loopEnd);
  for (const reason of ['empty_response', 'incomplete_response', 'missing_api_key', 'model_error']) {
    assert.match(attempts, new RegExp(`await record\\(\\{ outcome: 'error', reason: '${reason}'`));
  }
  assert.match(attempts, /capture\.model = captureModel\(attempt\);/);
  // Accepted, or null after a record. An unfinished response is accepted only
  // when no other model is waiting.
  assert.equal(count(attempts, /\breturn /g), 2);
  assert.match(attempts, /if \(rawText && \(result\.finished \|\| !hasNext\)\) return \{ result, rawText \};/);

  // After them: nothing came back from any model, the recorded update, and a
  // recorded failure to prepare a report from text that did arrive.
  const after = afterFacts.slice(loopEnd);
  assert.equal(count(after, /\breturn\b/g), 3);
  assert.equal(count(after, /await record\(/g), 2);

  for (const [file, trigger] of [
    ['src/app/api/cron/generate-gauge-updates/route.ts', 'scheduled'],
    ['src/lib/eddy/regenerate-gauge.ts', 'condition_change'],
  ] as const) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`generateGaugeUpdate\\([^)]*\\{ trigger: '${trigger}' \\}\\)`), file);
  }
});
