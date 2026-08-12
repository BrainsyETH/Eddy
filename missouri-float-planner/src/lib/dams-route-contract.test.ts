import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SUMMARY_METRICS, DETAIL_METRICS, buildSnapshot } from '@/lib/data/dams';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

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

/**
 * Every iOS surface fed by the SUMMARY payload — /api/dams, not /api/dams/[id].
 *
 * The map screen is the easy one to forget: it is not a "dam component", it
 * calls fetchDams() itself and reads dam.metrics.release inline among a
 * thousand lines of map code. It was missed on the first pass of this test.
 *
 * Paths are relative to missouri-float-planner/, where the runner starts.
 */
const IOS_LIST_SURFACES = [
  '../eddy-ios/src/components/dam/DamRow.tsx',
  '../eddy-ios/src/components/dam/RiverDamPanel.tsx',
  '../eddy-ios/app/(tabs)/index.tsx',
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

test('every top-level field the iOS row reads is one the payload emits', () => {
  // Asserted against what buildSnapshot ACTUALLY returns, not against a
  // hand-written list. A list can only check the names someone remembered to
  // put in it; it cannot notice the server quietly ceasing to carry one, which
  // is the failure that reaches a phone. buildSnapshot is pure, so the field
  // set is answerable with no network.
  //
  // Table Rock rather than an arbitrary dam because it populates every optional
  // field — nameplate, tailwaterFishery, infoPhone — so the emitted key set is
  // the widest the builder produces. `tailwater` is optional and absent there,
  // so Clearwater is folded in for it.
  const emitted = new Set([
    ...Object.keys(buildSnapshot(USACE_DAMS['swl-table-rock-dam'], {}, [])),
    ...Object.keys(buildSnapshot(USACE_DAMS['swl-clearwater-dam'], {}, [])),
  ]);

  for (const path of IOS_LIST_SURFACES) {
    const source = stripComments(readFileSync(path, 'utf8'));
    for (const m of source.matchAll(/\bdam\.([A-Za-z]+)/g)) {
      // `metrics` is checked per-key by the tests above.
      if (m[1] === 'metrics') continue;
      assert.ok(
        emitted.has(m[1]),
        `${path} reads dam.${m[1]}, which buildSnapshot does not emit`
      );
    }
  }
});

test('the payload still carries the identity fields a list cannot render without', () => {
  // The other direction, and the one a name-checking test cannot see: the
  // builder dropping a field. These are not metrics — they come from the
  // registry and cost nothing to send — so their absence would be a mistake
  // rather than a trade-off, and it would reach installed clients as a blank
  // row rather than an error.
  const snapshot = buildSnapshot(USACE_DAMS['swl-clearwater-dam'], {}, []);
  for (const field of ['id', 'name', 'lakeName', 'state', 'generating', 'schedule', 'metrics']) {
    assert.ok(field in snapshot, `buildSnapshot stopped emitting ${field}`);
  }
  // `generating` is null-not-absent by contract: null means "this dam publishes
  // no turbine flow", which a client must render as nothing rather than "idle".
  assert.equal(snapshot.generating, null);
  assert.equal(snapshot.tailwater?.riverSlug, 'black', 'the tailwater link survives assembly');
});
