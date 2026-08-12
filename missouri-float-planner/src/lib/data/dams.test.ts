import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyIntervalHints, publishableValue } from './dams';

// `%-Flood Pool` is the one dam metric whose meaning is local rather than
// universal, and both surfaces render it unguarded as
// `${value.toFixed(0)}% flood pool`. Every case below is a real reading taken
// from CWMS on 2026-08-02.

test('an ordinary flood-pool percentage passes through untouched', () => {
  assert.equal(publishableValue({}, 'pctFloodPool', 0), 0);
  assert.equal(publishableValue({}, 'pctFloodPool', 2.29), 2.29);
  assert.equal(publishableValue({}, 'pctFloodPool', 90.78), 90.78);
});

test('a rounding-band negative clamps to zero rather than flickering', () => {
  // Tenkiller read -0.39% and +2.29% hours apart, drifting either side of the
  // top of its conservation pool. Dropping the metric on the negative reading
  // would make the row appear and disappear; rendering it raw would have shipped
  // "-0% flood pool".
  assert.equal(publishableValue({}, 'pctFloodPool', -0.39), 0);
  assert.equal(publishableValue({}, 'pctFloodPool', -0.5), 0);
});

test('a meaningfully negative flood pool is omitted, not shown as zero', () => {
  // Broken Bow read -7.52%: drawn down below the flood pool entirely. That is
  // the ordinary summer state, but "% flood pool" cannot express it, and
  // clamping it to 0% would assert the lake is at the top of its conservation
  // pool when it is well below.
  assert.equal(publishableValue({}, 'pctFloodPool', -7.52), null);
  assert.equal(publishableValue({}, 'pctFloodPool', -50), null);
});

test('a suppressed metric is omitted whatever its value', () => {
  // Robert S. Kerr and Webbers Falls hold a constant navigation pool and read
  // 90.78% and 94.23% of flood pool as their normal state — true numbers that
  // tell a reader the opposite of the truth beside Table Rock's 0%.
  const navDam = { suppressMetrics: ['pctFloodPool' as const] };
  assert.equal(publishableValue(navDam, 'pctFloodPool', 90.78), null);
  assert.equal(publishableValue(navDam, 'pctFloodPool', 0), null);
  // Suppression is per-metric: everything else at that dam still publishes.
  assert.equal(publishableValue(navDam, 'release', 0), 0);
  assert.equal(publishableValue(navDam, 'poolElevation', 459.82), 459.82);
});

test('other metrics are never clamped or dropped for being negative', () => {
  // Only flood pool has the below-zero meaning. A negative release or elevation
  // would be a data fault worth surfacing, not something to quietly hide.
  assert.equal(publishableValue({}, 'release', -5), -5);
  assert.equal(publishableValue({}, 'tailwaterTempF', -1), -1);
});

// ── Daily-interval detection on a RESOLVED series ──────────────────────────
// A declared series is flagged `dailyMean` by hand in the registry. A resolved
// one has nobody to flag it, and the resolver's specs admit `~1Day` for both
// release and inflow — Wappapello's and Mark Twain's inflow resolve to exactly
// that. Rendering a day-old average as a reading taken just now is the
// correctness bug the registry's own note warns about.

test('a resolved daily series is flagged and given a longer lookback', () => {
  // The live resolution, verbatim from the resolver log on 2026-08-12.
  assert.deepEqual(
    dailyIntervalHints('Wappapello Lk-St Francis.Flow-In.Ave.~1Day.1Day.lakerep-rev'),
    { dailyMean: true, lookbackHours: 72 }
  );
  // A daily mean is published about a day in arrears, so the default 8-hour
  // window would find nothing at all — which is how it would present as an
  // absent metric rather than a labelled one.
  assert.equal(
    dailyIntervalHints('Mark Twain Lk-Salt.Flow-In.Ave.~1Day.1Day.lakerep-rev').lookbackHours,
    72
  );
});

test('an hourly series is left entirely alone', () => {
  // The six Little Rock dams and every Tulsa project resolve to 1Hour. Flagging
  // one of these would put a "daily average" label on a spot reading.
  assert.deepEqual(dailyIntervalHints('Table_Rock_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp'), {});
  assert.deepEqual(dailyIntervalHints('TENK.Flow-Res In.Ave.1Hour.1Hour.Rev-Regi-Computed'), {});
  assert.deepEqual(dailyIntervalHints('TENK.Elev-Tailwater.Inst.1Hour.0.Ccp-Rev'), {});
});

test('the INTERVAL decides, not the rest of the id', () => {
  // `1Day` appears in the duration field of every daily series and in the
  // version string of some others. Matching the whole id would flag an hourly
  // series whose version happens to contain the word.
  assert.deepEqual(dailyIntervalHints('Some_Dam.Flow-Out.Ave.1Hour.1Hour.1Day-RunAve'), {});
  assert.deepEqual(dailyIntervalHints('not a timeseries id'), {});
});
