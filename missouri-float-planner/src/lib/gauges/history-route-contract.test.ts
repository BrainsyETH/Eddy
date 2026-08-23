import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Observed and forecast are INDEPENDENTLY OPTIONAL on /api/gauges/[siteId]/history.
//
// NWPS forecasts stations it has no telemetry at, and observes stations it
// never forecasts (BDPM7 returns ~1,400 observed points and zero forecast;
// AGYM7 likewise; other LIDs are forecast-only). The route used to 404 the
// moment the observed series was empty — before ever asking for the forecast —
// so a forecast-only station could never produce a chart, and no client could
// tell that from "this station has nothing".
//
// A handler test would need a mocked Supabase, a mocked provider registry and
// a mocked NWPS; what actually regresses here is ORDER — someone tidies the
// route and moves the early-return back above the forecast fetch, and it
// type-checks perfectly. Same instrument as chart-parity.test.ts: pin the
// source shape.

const ROUTE = join(__dirname, '../../app/api/gauges/[siteId]/history/route.ts');

test('the not-found decision waits for the forecast', () => {
  const source = readFileSync(ROUTE, 'utf-8');
  const forecastFetch = source.indexOf('fetchNwsForecast(');
  const notFound = source.indexOf("'Historical data not available for this gauge'");
  assert.ok(forecastFetch > 0, 'route no longer fetches the NWS forecast — update this guard');
  assert.ok(notFound > 0, 'route no longer has a not-found branch — update this guard');
  assert.ok(
    forecastFetch < notFound,
    '404 is decided before the forecast is fetched — a forecast-only station (no observed series) must still return its forecast, not 404',
  );
});

test('404 requires BOTH series to be missing', () => {
  const source = readFileSync(ROUTE, 'utf-8');
  assert.match(
    source,
    /!historicalData && !\(forecastDoc\?\.points \?\? \[\]\)\.length/,
    'the not-found condition must check the forecast too, or forecast-only stations 404',
  );
});

test('an empty observed series is a response body, not an error', () => {
  // readings: [] stays valid — clients with no observed points render their
  // no-data state today and build a forecast-only domain when the shared chart
  // model learns to (Release 3). The route must not invent readings to avoid
  // an empty array.
  const source = readFileSync(ROUTE, 'utf-8');
  assert.match(source, /historicalData\?\.readings \?\? \[\]/);
});

// ── Release 3: additive request, provider-aware limits ───────────

test('invalid or reversed explicit windows are rejected, never coerced', () => {
  // A change in kind from the days clamp, on purpose: ?days=90 predates this
  // route knowing providers and keeps its clamp-to-legal behaviour, but a
  // client that sends a reversed from/to typed it, and silently serving some
  // other window is worse than a 400 that says what was wrong.
  const source = readFileSync(ROUTE, 'utf-8');
  assert.match(source, /"'to' must be after 'from'"/);
  assert.match(source, /Invalid 'from' date/);
  assert.match(source, /Invalid resolution/);
});

test('the days ceiling is the provider declaration, not a global 30', () => {
  const source = readFileSync(ROUTE, 'utf-8');
  assert.doesNotMatch(
    source,
    /Math\.min\(Math\.max\(days, 1\), 30\)/,
    'the provider-blind 30-day clamp is back',
  );
  assert.match(source, /historyCapabilities/, 'the route no longer consults provider capabilities');
});

test('the response reports coverage instead of letting truncation pass as data', () => {
  const source = readFileSync(ROUTE, 'utf-8');
  for (const field of ['requestedWindow', 'coverageWindow', 'coverageComplete', 'truncationReason', 'seasonalRange', 'statistic']) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `response lost ${field}`);
  }
});

test('source selection weighs completeness, never point count alone', () => {
  // ~14,000 stations pass a bare MIN_DB_POINTS check on history frozen the
  // day the cron stopped polling them; a window served from its back half
  // reads as "the river was quiet" when the truth is "we stopped recording".
  const source = readFileSync(ROUTE, 'utf-8');
  assert.match(source, /dbIncomplete/);
  assert.match(source, /stale \|\|[\s\S]*?dbIncomplete/);
});
