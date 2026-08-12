import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SUMMARY_METRICS, DETAIL_METRICS } from '@/lib/data/dams';

// What /api/dams is allowed to stop sending.
//
// ── Why this is a test and not a type ──────────────────────────────────────
// The consumer is a SHIPPED iOS BINARY. Trimming a field from the summary
// payload cannot break a compile — it breaks a phone in somebody's pocket,
// silently, by rendering a blank where a number was. TypeScript checks the app
// that is being built; it cannot check the app that was built last month.
//
// So the contract is pinned against the iOS source itself rather than restated
// by hand. A list surface that starts reading a new metric fails here until
// that metric is added to SUMMARY_METRICS — which is the correct order of
// operations, because the payload has to carry it before the client can read it.
//
// Same arrangement as ios-routes.test.ts and the bundle parity tests, and for
// the same reason: eddy-ios has no test runner, so anything checkable is
// checked from here.

/** Paths are relative to missouri-float-planner/, where the runner starts. */
const IOS_LIST_SURFACES = [
  '../eddy-ios/src/components/dam/DamRow.tsx',
  '../eddy-ios/src/components/dam/RiverDamPanel.tsx',
];

/** Comments discuss fields they do not read — `dam.metrics.inflow` in prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Every `<something>.metrics.X` read in a file. */
function metricsRead(source: string): Set<string> {
  const found = new Set<string>();
  for (const m of stripComments(source).matchAll(/\.metrics\.([A-Za-z]+)/g)) {
    found.add(m[1]);
  }
  return found;
}

test('every metric an iOS list surface reads is in the summary payload', () => {
  // The failure this prevents: /api/dams trimmed to a summary set, a list
  // component still reading a metric that is no longer sent, and the tile
  // rendering nothing at all — because the wire contract says an absent metric
  // means "this dam does not publish it", which is indistinguishable from
  // "the server decided not to send it".
  for (const path of IOS_LIST_SURFACES) {
    const read = metricsRead(readFileSync(path, 'utf8'));
    for (const metric of read) {
      assert.ok(
        (SUMMARY_METRICS as string[]).includes(metric),
        `${path} reads metrics.${metric}, which /api/dams no longer sends. ` +
          `Add it to SUMMARY_METRICS or stop reading it.`
      );
    }
  }
});

test('generationFlow stays in the summary because `generating` is derived from it', () => {
  // The subtlest way to break every list in the app while saving one request.
  // `DamSnapshot.generating` is not a field the Corps publishes — it is computed
  // from turbine flow against the dam's generationOnCfs floor. Without the
  // metric it is null, null renders nothing by contract, and the generating
  // chip disappears from the index, Favorites and search results at once, with
  // no error raised anywhere.
  assert.ok(
    SUMMARY_METRICS.includes('generationFlow'),
    'dropping generationFlow silently nulls `generating` on every list surface'
  );
});

test('the summary is a strict subset of the detail payload', () => {
  // Otherwise a list could show something its own dam page does not, which
  // makes the tap a downgrade.
  for (const metric of SUMMARY_METRICS) {
    assert.ok(DETAIL_METRICS.includes(metric), `${metric} is in summary but not detail`);
  }
  assert.ok(
    DETAIL_METRICS.length > SUMMARY_METRICS.length,
    'a detail set identical to the summary means the split bought nothing'
  );
});

test('the summary stays small enough to be worth splitting', () => {
  // Guards the reason this exists. Seven metrics across twenty dams was 43
  // declared reads plus 81 unresolved slots plus up to 243 probe requests, all
  // uncached, on every index render and every /api/dams call. If the summary
  // creeps back toward the detail set, that cost returns and the split becomes
  // a second code path with no benefit.
  assert.ok(
    SUMMARY_METRICS.length <= 4,
    `summary has grown to ${SUMMARY_METRICS.length} metrics; re-measure the index fan-out`
  );
});

test('the iOS row reads only snapshot fields the summary carries', () => {
  // metrics are checked above; these are the top-level fields. Listed rather
  // than derived because they come from the registry rather than from a fetch,
  // so the risk is not that they go missing — it is that a future summary
  // builder starts omitting them to save bytes.
  const CARRIED = new Set([
    'id',
    'name',
    'lakeName',
    'state',
    'generating',
    'schedule',
    'metrics',
    'tailwaterFishery',
    'tailwater',
    'sources',
    'hasTurbines',
    'nameplate',
    'infoPhone',
    'lat',
    'lon',
  ]);
  const source = stripComments(readFileSync(IOS_LIST_SURFACES[0], 'utf8'));
  for (const m of source.matchAll(/\bdam\.([A-Za-z]+)/g)) {
    assert.ok(CARRIED.has(m[1]), `DamRow reads dam.${m[1]}, which is not a snapshot field`);
  }
});
