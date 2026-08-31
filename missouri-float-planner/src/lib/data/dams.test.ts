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

// ── hasCwmsMetricsPath ───────────────────────────────────────────────────────
// The gate readMetrics opens with. It was `office && cdaLocation`, which was
// correct for every dam until the Nashville three: explicit series and
// cdaLocations (plural), no cdaLocation — and the old gate silently returned
// {} for all of them, blanking every metric on their pages while offline
// tests stayed green. Asserted against the REAL registry so the next
// location shape has to confront this test rather than repeat that failure.

import { hasCwmsMetricsPath } from './dams';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

test('every dam with declared CWMS series can actually be read', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    if (Object.keys(dam.series).length > 0) {
      assert.ok(hasCwmsMetricsPath(dam), `${dam.id} declares series readMetrics would never fetch`);
    }
  }
  // The three location shapes, by name, so a regression names its dam:
  assert.ok(hasCwmsMetricsPath(USACE_DAMS['swl-table-rock-dam']), 'single cdaLocation');
  assert.ok(hasCwmsMetricsPath(USACE_DAMS['lrn-wolf-creek-dam']), 'cdaLocations list');
  assert.ok(!hasCwmsMetricsPath(USACE_DAMS['nwk-stockton-dam']), 'no CWMS at all');
  // Ameren-backed dams never enter the CWMS path — theirs is readAmerenMetrics.
  assert.ok(!hasCwmsMetricsPath(USACE_DAMS['ameren-bagnell-dam']), 'Ameren, not CWMS');
});

// ── wantsHistory ─────────────────────────────────────────────────────────────
// Which dams the history cron keeps an hourly record for. This lived inline in
// the route as `swpaCode && cdaLocation` — the same singular-only blindness
// hasCwmsMetricsPath above was extracted to prevent, one file over. Nothing
// offline pinned the cron's dam set, so a project configured the Nashville way
// but without a hand-declared generationFlow would have been dropped in
// silence: no error, the strip simply never filling.

import { wantsHistory } from './dams';

test('the history cron keeps every dam that can report turbine flow', () => {
  // The 18 dams with rows in production on 2026-08-16, by shape:
  assert.ok(wantsHistory(USACE_DAMS['swl-table-rock-dam']), 'declared generationFlow, SWL');
  assert.ok(wantsHistory(USACE_DAMS['lrn-wolf-creek-dam']), 'declared generationFlow, no SWPA column');
  assert.ok(wantsHistory(USACE_DAMS['swt-tenkiller-dam']), 'SWPA column, series resolved at request time');
});

test('a dam with no generation is not given an empty strip', () => {
  // Storing release alone would draw a strip whose top half is permanently
  // blank, which reads as "the units were off all week" rather than "this dam
  // has no units".
  assert.ok(!wantsHistory(USACE_DAMS['swl-clearwater-dam']), 'flood control, no powerhouse');
  assert.ok(!wantsHistory(USACE_DAMS['ameren-bagnell-dam']), 'not CWMS — no office to fetch from');
});

test('a turbine dam is kept whichever location shape it declares', () => {
  // The regression guard. A future project with turbines, cdaLocations
  // (plural) and no hand-written generationFlow must not fall through.
  const nashvilleShaped = {
    ...USACE_DAMS['lrn-wolf-creek-dam'],
    id: 'lrn-hypothetical-dam',
    swpaCode: 'HYP',
    series: {},
  };
  assert.ok(
    wantsHistory(nashvilleShaped),
    'cdaLocations (plural) must satisfy the location half, exactly as cdaLocation does'
  );
});

// ── the stored snapshot ──────────────────────────────────────────────────────
// A dam page is assembled by a cron now rather than by the reader's request —
// seven CWMS series, up to three SWPA files, a pattern read and a forecast,
// measured at 8.16s cold. See src/lib/data/dam-snapshot-store.ts.
//
// Storing an assembled payload creates exactly two ways for it to become
// dishonest: a field that goes out of date in the row (staleness), and a
// projection that drifts from what the live path would have produced
// (summaryOf). Both are pure and both are pinned here.

import {
  buildSnapshot,
  refreshStaleness,
  summaryOf,
  DETAIL_METRICS,
  SUMMARY_METRICS,
  SUMMARY_SCHEDULE_DAYS,
} from './dams';
import type {
  DamMetricValue,
  DamScheduleDay,
  DamSnapshot,
  UsaceMetric,
} from '@shared/dam-types';

const HOUR = 3_600_000;

function scheduleDay(scheduleDate: string): DamScheduleDay {
  return { scheduleDate, hours: [], idle: [], retrievedAt: null };
}

function reading(now: number, value: number, unit: string): DamMetricValue {
  return { value, unit, at: new Date(now).toISOString(), staleness: 'fresh' };
}

/** A stored DETAIL snapshot for a real registry dam, built the way the cron would. */
function storedDetail(now: number, overrides?: Partial<DamSnapshot>): DamSnapshot {
  const dam = USACE_DAMS['swl-table-rock-dam'];
  return {
    ...buildSnapshot(
      dam,
      {
        release: reading(now, 4_200, 'cfs'),
        generationFlow: reading(now, 3_100, 'cfs'),
        tailwaterElevation: reading(now, 704.2, 'ft'),
        // Detail-only: must not survive into a summary.
        poolElevation: reading(now, 917.3, 'ft'),
      } satisfies Partial<Record<UsaceMetric, DamMetricValue>>,
      [scheduleDay('2026-08-31'), scheduleDay('2026-09-01'), scheduleDay('2026-09-02')],
    ),
    ...overrides,
  };
}

test('a summary carries only what a list shows', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');
  const summary = summaryOf(storedDetail(now));
  assert.ok(summary, 'a registry dam must project');

  // SUMMARY_METRICS, and nothing beyond them. Pool elevation is the detail
  // page's number and would be ~20 extra readings on a twenty-row list.
  for (const metric of SUMMARY_METRICS) {
    assert.ok(summary.metrics[metric], `${metric} must survive the narrowing`);
  }
  for (const metric of DETAIL_METRICS.filter((m) => !SUMMARY_METRICS.includes(m))) {
    assert.ok(!summary.metrics[metric], `${metric} is a detail metric and must be dropped`);
  }

  // The schedule window narrows to what fetchDamSummary would have asked for.
  assert.equal(summary.schedule.length, SUMMARY_SCHEDULE_DAYS);
  assert.equal(summary.schedule[0].scheduleDate, '2026-08-31');
});

test('a summary is what the live summary path would have built', () => {
  // The whole argument for storing one payload instead of two: the projection
  // has to be indistinguishable from a fresh read, or the list and the page
  // start disagreeing about a dam. Both go through buildSnapshot, so this
  // compares the projection against buildSnapshot called directly with the
  // narrowed inputs.
  const now = Date.parse('2026-08-31T12:00:00Z');
  const detail = storedDetail(now);
  const dam = USACE_DAMS['swl-table-rock-dam'];

  const narrowed: Partial<Record<UsaceMetric, DamMetricValue>> = {};
  for (const metric of SUMMARY_METRICS) {
    const value = detail.metrics[metric];
    if (value) narrowed[metric] = value;
  }
  const expected = buildSnapshot(dam, narrowed, detail.schedule.slice(0, SUMMARY_SCHEDULE_DAYS));

  assert.deepEqual(summaryOf(detail), expected);
});

test('a summary drops the sections only a detail page draws', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');
  const detail = storedDetail(now, {
    pattern: [
      {
        scheduleDate: '2026-08-30',
        startUtc: new Date(now - 24 * HOUR).toISOString(),
        turbineCfs: [1_000],
        totalReleaseCfs: [1_200],
      },
    ],
    generationForecast: {
      windows: [
        {
          startUtc: new Date(now).toISOString(),
          endUtc: new Date(now + HOUR).toISOString(),
          generating: true,
          peakCfs: 3_100,
        },
      ],
      timeZone: 'America/Chicago',
      retrievedAt: new Date(now).toISOString(),
      source: 'U.S. Army Corps of Engineers',
    },
  });

  const summary = summaryOf(detail);
  assert.ok(summary);
  assert.ok(!summary.pattern, 'a week of hourly pattern has no place on a list row');
  assert.ok(!summary.generationForecast, 'nor nine days of forecast');
});

test('a dam the registry no longer carries does not project', () => {
  // The stored row outlives the registry entry — the table has no foreign key,
  // because dams are read-through and have no rows to point at. A row nothing
  // can render must not be served.
  const now = Date.parse('2026-08-31T12:00:00Z');
  const orphan = { ...storedDetail(now), id: 'swl-a-dam-that-was-removed' };
  assert.equal(summaryOf(orphan), null);
});

test('a stored reading ages instead of insisting it is fresh', () => {
  // `staleness` is stamped at assembly. On the live path that is microseconds
  // before the response; on the stored path it can be an hour, and serving a
  // stamp from an hour ago is the one way storing a snapshot makes it say
  // something untrue rather than merely old.
  const observedAt = Date.parse('2026-08-31T12:00:00Z');
  const stored = storedDetail(observedAt);
  assert.equal(stored.metrics.release?.staleness, 'fresh');

  const served = refreshStaleness(stored, observedAt + 8 * HOUR);
  assert.notEqual(
    served.metrics.release?.staleness,
    'fresh',
    'an eight-hour-old reading must not still call itself fresh',
  );
  // The observation time itself never moves — it is a fact about the river.
  assert.equal(served.metrics.release?.at, stored.metrics.release?.at);
});

test('an unparseable observation time is left exactly as stored', () => {
  // Rewriting a field we cannot evaluate is how a bad value becomes an
  // asserted one.
  const now = Date.parse('2026-08-31T12:00:00Z');
  const stored = storedDetail(now);
  const broken: DamSnapshot = {
    ...stored,
    metrics: {
      ...stored.metrics,
      release: { ...stored.metrics.release!, at: 'not a timestamp', staleness: 'lagging' },
    },
  };

  assert.equal(refreshStaleness(broken, now).metrics.release?.staleness, 'lagging');
});
