import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  durationBucket,
  routeOf,
  worthReporting,
  SLOW_REQUEST_MS,
} from '../../../eddy-ios/src/lib/requestTiming';

// The iOS API client's timing rules, tested from here because eddy-ios has no
// runner of its own — the same arrangement as first-run-rivers.test.ts and
// dam-catalog-parity.test.ts.
//
// The load-bearing test in this file is the identifier one. Everything else is
// about the quality of a measurement; that one is about what leaves the device.

// ── what a route is called ────────────────────────────────────────────────

test('a route name carries no identifier the reader chose', () => {
  // Every shape client.ts actually builds, with a real-looking value in the
  // slot. None of the values may survive into the route name: a slug, a site
  // id, a plan code and a search term are all records of what somebody looked
  // at, and this is the boundary they must not cross. See redact.ts.
  const paths: [string, string][] = [
    ['/api/rivers/eleven-point', '/api/rivers/:slug'],
    ['/api/rivers/eleven-point/hazards', '/api/rivers/:slug/hazards'],
    ['/api/rivers/eleven-point/outlook?gaugeId=07071500', '/api/rivers/:slug/outlook'],
    ['/api/rivers/current/access/akers-ferry', '/api/rivers/:slug/access/:accessSlug'],
    ['/api/gauges/07068000', '/api/gauges/:siteId'],
    ['/api/gauges/07068000/history?days=30', '/api/gauges/:siteId/history'],
    ['/api/dams/swl-table-rock-dam', '/api/dams/:damId'],
    ['/api/conditions/8f14e45f-ceea-467a-9575-0e6a2f0f2a1b', '/api/conditions/:riverId'],
    ['/api/plan/a1b2c3', '/api/plan/:shortCode'],
    ['/api/me/gauge-alerts/8f14e45f-ceea', '/api/me/gauge-alerts/:id'],
    ['/api/search?q=akers%20ferry&limit=25', '/api/search'],
    ['/api/public-lands?bbox=-91.5,36.9,-91.1,37.2', '/api/public-lands'],
    ['/api/gauges/map?tiles=12/1000/1500', '/api/gauges/map'],
  ];

  for (const [path, expected] of paths) {
    assert.equal(routeOf(path), expected, path);
  }
});

test('the collections under /api/me keep their names', () => {
  // They are fixed route segments, not identifiers, and collapsing them would
  // put every account request in one bucket — which is the same as having no
  // measurement of any of them.
  assert.equal(routeOf('/api/me/starred-rivers'), '/api/me/starred-rivers');
  assert.equal(routeOf('/api/me/notification-preferences'), '/api/me/notification-preferences');
  assert.equal(routeOf('/api/me/entitlement/refresh'), '/api/me/entitlement/refresh');
  // …but a query is still dropped, because that is where the ids ride.
  assert.equal(routeOf('/api/me/starred-rivers?riverId=abc-123'), '/api/me/starred-rivers');
});

test('an absolute url is reduced to its route', () => {
  // Several call sites in client.ts build `${BASE_URL}${path}` and hand the
  // whole url over. Answering '/api' for those would lose exactly the write
  // routes with the most work behind them.
  assert.equal(routeOf('https://eddy.guide/api/plan/save'), '/api/plan/save');
  assert.equal(routeOf('https://eddy.guide/api/dams/swl-beaver-dam'), '/api/dams/:damId');
  assert.equal(routeOf('http://localhost:3000/api/rivers'), '/api/rivers');
});

test('an unknown path falls back to its first two segments', () => {
  // Coarse, never wrong, and never revealing — the property that matters for a
  // route this table has not been taught yet.
  assert.equal(routeOf('/api/something/new/and/deep/abc-123'), '/api/something');
  assert.equal(routeOf('/not-an-api-path'), '/api');
  assert.equal(routeOf(''), '/api');
});

// ── what gets reported ────────────────────────────────────────────────────

test('a cancellation is never reported, however long it took', () => {
  // A screen going away is the app working. Reporting it would make a fast
  // scroll through rivers look like a wall of failures.
  assert.equal(worthReporting('cancelled', 30_000), false);
  assert.equal(worthReporting('cancelled', 10), false);
});

test('a timeout is always reported and a fast success never is', () => {
  assert.equal(worthReporting('timeout', 15_000), true);
  assert.equal(worthReporting('ok', 90), false);
});

test('a success is reported once it is slow enough to have been noticed', () => {
  assert.equal(worthReporting('ok', SLOW_REQUEST_MS - 1), false);
  assert.equal(worthReporting('ok', SLOW_REQUEST_MS), true);
});

test('a non-2xx response is left to the call site that knows what it means', () => {
  // Several of them treat a 404 or a 401 as an ordinary answer. Reporting one
  // here would duplicate that judgement in the layer with the least context.
  assert.equal(worthReporting('failed', 20_000), false);
});

// ── the throttle ──────────────────────────────────────────────────────────

test('durations bucket, so a message can be throttled', () => {
  // warn() fingerprints on the message. An exact millisecond count would mint a
  // new fingerprint every time and never be throttled at all — which is how a
  // budget meant to protect the Sentry quota comes to spend it.
  assert.equal(durationBucket(90), '<1s');
  assert.equal(durationBucket(1_500), '1-2s');
  assert.equal(durationBucket(4_999), '2-5s');
  assert.equal(durationBucket(8_160), '5-10s');
  assert.equal(durationBucket(15_000), '10-20s');
  assert.equal(durationBucket(28_500), '20s+');

  // Two nearby slow readings must land on ONE message, or the throttle cannot
  // see them as the same condition.
  assert.equal(durationBucket(8_160), durationBucket(9_900));
});

// ── the wiring ────────────────────────────────────────────────────────────

test('every request path in the client is timed', () => {
  // A timer applied at three of four call sites measures a fiction: the
  // untimed one is invisible, and it is as likely as any other to be the slow
  // one. Both fetch wrappers and both hand-rolled paths record.
  const source = readFileSync('../eddy-ios/src/api/client.ts', 'utf8');
  const timers = source.match(/recordTiming\(/g) ?? [];
  assert.ok(
    timers.length >= 8,
    `expected every request path to record a timing, found ${timers.length} calls`,
  );

  // And it goes through routeOf rather than sending the path — the property the
  // first test in this file protects, pinned at the one place that could
  // bypass it.
  assert.match(
    source,
    /const route = routeOf\(path\)/,
    'recordTiming must name the route, never the path',
  );
});

// ── the two restart races these timings would otherwise have measured ─────
//
// Both are iOS screen wiring, so both are pinned textually — the alternative is
// running an Expo screen under node:test. An ordering and a de-duplication are
// exactly the kind of property a later rewrite drops without noticing, and both
// of these cost a full copy of the app's slowest request when they regress.

test('the outlook effect joins an in-flight request instead of restarting it', () => {
  // primaryGaugeId is derived from /api/gauges, which lands seconds after this
  // effect first runs and long before the outlook does. That transition re-ran
  // the effect with THE SAME KEY on an ordinary arrival, found no cache entry
  // because the first request had not come back, aborted it, and started an
  // identical one — so the reader waited out two serial copies of a one-to-six
  // second request.
  const source = readFileSync('../eddy-ios/app/river/[slug].tsx', 'utf8');

  assert.match(source, /outlookInFlight/, 'the effect must track its in-flight requests');
  assert.match(
    source,
    /let request = outlookInFlight\.current\.get\(key\);/,
    'a run must look for an existing request before starting one',
  );
  // And the cleanup must not abort: the answer belongs to the cache as much as
  // to the run that asked for it.
  assert.ok(
    !/return \(\) => controller\.abort\(\);\s*\}, \[slug, shownGaugeId, primaryGaugeId\]\)/.test(source),
    'the outlook cleanup must not abort a request other runs may be joining',
  );
});

test('the dam screen has exactly one loader', () => {
  // useFocusEffect already fires on mount, so a mount effect beside it meant two
  // fetchDam calls per arrival on a route that reads through to CWMS and SWPA —
  // and with a summary seed calling getSharedDams as well, three concurrent
  // requests for one dam. The river screen's loadDam records what the same
  // duplicate cost there.
  const source = readFileSync('../eddy-ios/app/dam/[damId].tsx', 'utf8');

  const loads = source.match(/load\(controller\.signal,/g) ?? [];
  assert.equal(loads.length, 1, `the dam screen must have one loader, found ${loads.length}`);

  // The detail goes through the shared request, and the summary seed never
  // fetches at all.
  assert.match(source, /getSharedDam\(damId\)/, 'the detail must share one in-flight request');
  assert.match(source, /peekSharedDams\(\)/, 'the seed must read the store, not fill it');
  assert.ok(
    !source.includes('getSharedDams()'),
    'the seed must not start a twenty-dam request beside the one-dam one',
  );
});
