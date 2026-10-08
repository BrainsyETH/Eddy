import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A static guard, in the style of scripts/security/segment-cache-policy.test.ts.
//
// The behaviour under test is three Supabase round-trips deep, and nothing in
// this repo mocks the Supabase client — so a behavioural test would mean
// inventing that harness for one call site. What actually needs protecting is
// narrower and static: the generator must ask for the REACH's gauge, not the
// river's.
//
// This matters because the failure is silent and reads as plausible. With the
// section dropped, an Eddy update for the Black's tailwater is built from the
// Annapolis gauge 20 miles above Clearwater Dam: it reported "good, 280 cfs"
// for water running high at 3,310, and the model — handed those numbers next to
// a section description naming the Poplar Bluff gauge — attributed Annapolis's
// reading to Poplar Bluff by name. Nothing errors. Nothing looks wrong.

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const generateUpdate = src('src/lib/eddy/generate-update.ts');
const getGaugeConditions = src('src/lib/gauge/get-gauge-conditions.ts');

test('the update generator asks for the reach gauge, not the river gauge', () => {
  assert.match(
    generateUpdate,
    /getGaugeConditions\(\s*target\.riverSlug\s*,\s*target\.sectionSlug\s*\)/,
    'generate-update.ts must pass target.sectionSlug to getGaugeConditions',
  );
});

test('getGaugeConditions accepts a section and resolves its gauge', () => {
  // Signature keeps the section optional, so whole-river callers (chat handlers)
  // stay source-compatible.
  assert.match(
    getGaugeConditions,
    /export async function getGaugeConditions\(\s*riverSlug: string,\s*sectionSlug\?: string \| null,/,
  );
  // And it must actually read the reach's declared gauge from migration 00204.
  assert.match(getGaugeConditions, /river_sections/);
  assert.match(getGaugeConditions, /primary_gauge_station_id/);
});

test('a reach without its own gauge still falls back to the river primary', () => {
  // Returning null instead would drop the report entirely for a curation slip.
  assert.match(getGaugeConditions, /\.eq\('is_primary', true\)/);
});

test('the trajectory is read from the same site as the reading', () => {
  // buildGaugeTrajectory(riverSlug) is is_primary-only, so keying the trend off
  // the river while the reading comes from the reach would put two different
  // rivers in one paragraph -- the tailwater's level beside the upper river's
  // 24-hour movement.
  assert.match(
    generateUpdate,
    /buildGaugeTrajectoryForSite\(\s*gaugeResult\.usgsSiteId\s*\)/,
    'generate-update.ts must address the trajectory by site, not by river slug',
  );
  assert.doesNotMatch(
    generateUpdate,
    /buildGaugeTrajectory\(\s*target\.riverSlug\s*\)/,
    'generate-update.ts must not fall back to the river-level trajectory',
  );
});

test('the shared loader keeps the website-compatible classification', () => {
  assert.match(getGaugeConditions, /computeCondition\(gaugeHeightFt, thresholds, dischargeCfs\)/);
});

test('both generators preserve alerts before fallback and skip unused trajectory/model work', () => {
  for (const generator of [generateUpdate, src('src/lib/eddy/generate-gauge-update.ts')]) {
    const fallback = generator.indexOf('const fallback = preflightReportFallback(facts)');
    assert.ok(fallback > generator.indexOf('await fetchNWSAlerts('));
    assert.ok(fallback < generator.indexOf('await buildGaugeTrajectoryForSite('));
    assert.ok(fallback < generator.indexOf('const client = new Anthropic('));
    assert.match(generator.slice(fallback), /if \(fallback\) return \{[\s\S]*?usage: null/);
    assert.match(generator, /sourcesUsed: publishedSources/);
  }
  assert.ok(generateUpdate.indexOf('const fallback = preflightReportFallback(facts)') < generateUpdate.indexOf('const localKnowledge = getKnowledgeForTarget('));
});


test('section reports use the website RPC for positional gauge resolution', () => {
  assert.match(getGaugeConditions, /rpc\('get_river_condition_segment'/);
  assert.match(getGaugeConditions, /p_put_in_mile: sectionStartMile/);
  assert.match(getGaugeConditions, /\.eq\('gauge_stations.usgs_site_id', resolvedSectionUsgsId\)/);
  assert.match(getGaugeConditions, /sectionGaugeSupportsReport\(/);
});

test('secondary target loading does not hydrate unused primary readings', () => {
  const generator = src('src/lib/eddy/generate-gauge-update.ts');
  const loader = generator.slice(generator.indexOf('export async function getSecondaryGaugeTargets'), generator.indexOf('export async function generateGaugeUpdate'));
  assert.doesNotMatch(loader, /from\('gauge_readings'\)|primaryBySlug|primaryStationIds/);
  assert.match(loader, /is_primary.eq.false,is_primary.is.null/);
});

test('curated selection happens before RPC and is never erased on RPC failure', () => {
  assert.ok(getGaugeConditions.indexOf(".eq('gauge_station_id', sectionStationId)") < getGaugeConditions.indexOf("rpc('get_river_condition_segment'"));
  assert.doesNotMatch(getGaugeConditions, /sectionStationId = null;/);
  assert.match(getGaugeConditions, /if \(!gaugeLink && sectionStartMile != null\)/);
});

test('missing gauge does not bypass alert gathering or fallback publication', () => {
  assert.doesNotMatch(generateUpdate, /if \(!gaugeResult\) return null/);
  assert.match(generateUpdate, /conditionCode: gaugeResult\?\.conditionCode \?\? 'unknown'/);
  assert.match(generateUpdate, /gaugeName: gaugeResult\?\.gaugeName \?\? null/);
  for (const generator of [generateUpdate, src('src/lib/eddy/generate-gauge-update.ts')]) {
    assert.match(generator, /prepareGeneratedReport\(rawText, facts\)/);
    assert.doesNotMatch(generator, /guardReport\(parsed/);
  }
});

test('unavailable alert coverage is logged and yields no locally attributed alerts', () => {
  const alerts = src('src/lib/nws/alerts.ts');
  assert.match(alerts, /if \(matched == null\) \{[\s\S]*?console.warn[\s\S]*?return \[\]/);
});

test('both model system prompts allow the required claims header', () => {
  for (const generator of [generateUpdate, src('src/lib/eddy/generate-gauge-update.ts')]) {
    assert.match(generator, /MUST begin with the exact \[CLAIMS\] line/);
    assert.doesNotMatch(generator, /ONLY the \[SUMMARY\]/);
  }
});


test('secondary prompts require a successful section check before using river behavior', () => {
  const gauge = src('src/lib/eddy/generate-gauge-update.ts');
  assert.match(gauge, /let riverBehaviorApplies = false/);
  assert.match(gauge, /\.from\('river_sections'\)[\s\S]*?\.eq\('river_id', riverCtx\.id\)[\s\S]*?\.not\('river_type', 'is', null\)/);
  assert.match(gauge, /riverBehaviorApplies = !error && overrides != null && overrides\.length === 0/);
  assert.match(gauge, /buildGaugePrompt\(target, facts, readingTimestamp, trajectory, forecast, riverCtx, riverBehaviorApplies\)/);
  assert.match(gauge, /buildSecondaryGaugeSemantics\(riverCtx, riverBehaviorApplies\)/);
  assert.doesNotMatch(gauge, /LOCAL RIVER BEHAVIOR|characteristics\.(lowWaterMeaning|risingWaterHazards|riverNote|rainLagNote)/);
});

test('river prompt asks Eddy to know which stretch a gauge speaks for, without invented local facts', () => {
  assert.match(generateUpdate, /KNOW YOUR STRETCH: A good guide knows which water a gauge speaks for/);
  assert.match(generateUpdate, /Never describe another stretch's conditions today, and never invent where the river changes/);
  // The worked example must only use details the knowledge file actually holds.
  assert.doesNotMatch(generateUpdate, /jetboat/i);
});

test('secondary prompts carry river knowledge and never a mislabelled river mile', () => {
  const gauge = src('src/lib/eddy/generate-gauge-update.ts');
  assert.doesNotMatch(gauge, /lines\.push\(`Position: river mile/);
  assert.match(gauge, /getRiverKnowledgeForGauge\(target\.riverSlug, target\.gaugeName\)/);
  assert.match(gauge, /a detail about the upper river, another town or another section is not a detail about this station/);
});
