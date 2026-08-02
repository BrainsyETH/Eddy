// src/lib/social/live-conditions.test.ts
//
// The rule under test is the one a dead sensor keeps trying to break: a gauge
// with no value in the unit it is RATED IN must come back 'unknown', never its
// other unit graded against the wrong ladder.
//
// This is not hypothetical and it is not cheap. The Elk River is rated in feet.
// Its stage sensor started returning USGS's -999999 no-data sentinel on 27 April
// 2026 and has published nothing since. The cross-unit fallback graded the last
// estimated discharge it did carry — 1,720 cfs — against a 6-FOOT flood line,
// returned 'dangerous', and kept returning it. That verdict reached the
// statewide prose gate, which fails closed on a flooding river it cannot show
// the summary knew about, and the app's launch screen lost its written report
// for months over a gauge nobody could see.
//
// buildLiveConditionsMap is the one place that verdict is minted, so it is the
// one place worth pinning.

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveConditionsMap, STALE_READING_HOURS } from './live-conditions';

interface GaugeRow {
  slug: string;
  stationId: string;
  thresholdUnit: 'ft' | 'cfs';
  levelTooLow?: number | null;
  levelLow?: number | null;
  levelOptimalMin?: number | null;
  levelOptimalMax?: number | null;
  levelHigh?: number | null;
  levelDangerous?: number | null;
}

interface ReadingRow {
  stationId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  at: string;
}

/**
 * The two calls the function makes, and nothing else.
 *
 * Hand-rolled rather than mocked with a library: the shape being stubbed is
 * `.from().select().eq()` resolving to {data, error} plus one `.rpc()`, and a
 * fake that only answers those cannot drift away from the real client without
 * the test failing to run at all.
 */
function fakeSupabase(gauges: GaugeRow[], readings: ReadingRow[]) {
  return {
    from(table: string) {
      assert.equal(table, 'river_gauges');
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              assert.equal(column, 'is_primary');
              assert.equal(value, true);
              return Promise.resolve({
                data: gauges.map((g) => ({
                  rivers: { slug: g.slug },
                  gauge_stations: { id: g.stationId },
                  threshold_unit: g.thresholdUnit,
                  level_too_low: g.levelTooLow ?? null,
                  level_low: g.levelLow ?? null,
                  level_optimal_min: g.levelOptimalMin ?? null,
                  level_optimal_max: g.levelOptimalMax ?? null,
                  level_high: g.levelHigh ?? null,
                  level_dangerous: g.levelDangerous ?? null,
                })),
                error: null,
              });
            },
          };
        },
      };
    },
    rpc(name: string) {
      assert.equal(name, 'latest_readings_for_stations');
      return Promise.resolve({
        data: readings.map((r) => ({
          gauge_station_id: r.stationId,
          gauge_height_ft: r.gaugeHeightFt,
          discharge_cfs: r.dischargeCfs,
          reading_timestamp: r.at,
        })),
        error: null,
      });
    },
  };
}

const justNow = () => new Date(Date.now() - 15 * 60 * 1000).toISOString();

// The Elk's real ladder, out of river_gauges.
const ELK: GaugeRow = {
  slug: 'elk',
  stationId: 'elk-station',
  thresholdUnit: 'ft',
  levelTooLow: 2.5,
  levelOptimalMin: 3.5,
  levelOptimalMax: 5,
  levelDangerous: 6,
};

test('a ft-rated gauge with a dead stage sensor is unknown, not a flood', async () => {
  // THE REGRESSION, with the real numbers. 1,720 is cubic feet per second and
  // 6 is feet; the only relationship between them is that one is larger.
  const live = await buildLiveConditionsMap(
    fakeSupabase([ELK], [
      { stationId: 'elk-station', gaugeHeightFt: null, dischargeCfs: 1720, at: justNow() },
    ]),
  );
  assert.equal(live.get('elk')?.condition_code, 'unknown');
});

test('the same gauge still grades normally once it has a stage again', async () => {
  // The guard must not swallow the working case: 4.2 ft sits inside the Elk's
  // 3.5–5.0 optimal band and has to come back as such.
  const live = await buildLiveConditionsMap(
    fakeSupabase([ELK], [
      { stationId: 'elk-station', gaugeHeightFt: 4.2, dischargeCfs: 1720, at: justNow() },
    ]),
  );
  assert.equal(live.get('elk')?.condition_code, 'flowing');
});

test('a cfs-rated gauge with a dead discharge sensor is unknown too', async () => {
  // The mirror image, and the direction /api/high-water's own comment describes.
  // A stage of 9.9 ft against a 1,850 cfs ladder is not "safe", it is nonsense.
  const live = await buildLiveConditionsMap(
    fakeSupabase(
      [{ slug: 'huzzah', stationId: 'huzzah-station', thresholdUnit: 'cfs', levelLow: 100, levelOptimalMax: 730, levelDangerous: 1850 }],
      [{ stationId: 'huzzah-station', gaugeHeightFt: 9.9, dischargeCfs: null, at: justNow() }],
    ),
  );
  assert.equal(live.get('huzzah')?.condition_code, 'unknown');
});

test('a river with a working gauge is unaffected by the guard', async () => {
  const live = await buildLiveConditionsMap(
    fakeSupabase(
      [{ slug: 'current', stationId: 'current-station', thresholdUnit: 'cfs', levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 3000, levelDangerous: 3450 }],
      [{ stationId: 'current-station', gaugeHeightFt: 3.19, dischargeCfs: 1230, at: justNow() }],
    ),
  );
  const current = live.get('current');
  assert.equal(current?.condition_code, 'flowing');
  assert.equal(current?.discharge_cfs, 1230);
  assert.equal(current?.stale, false);
});

test('a river stays IN the map when its gauge dies, rather than dropping out', async () => {
  // Load-bearing, and the reason this guard returns 'unknown' instead of the
  // simpler-looking fix of excluding the river. overlayLiveConditions passes an
  // UNMATCHED row through unchanged — so a river missing from this map is a
  // river whose prose is served with no live reconciliation at all. Present and
  // unknown is safe; absent is not.
  const live = await buildLiveConditionsMap(
    fakeSupabase([ELK], [
      { stationId: 'elk-station', gaugeHeightFt: null, dischargeCfs: 1720, at: justNow() },
    ]),
  );
  assert.ok(live.has('elk'));
});

test('a reading older than the staleness ceiling is flagged stale', async () => {
  // What the statewide prose gate reads to decide a dangerous river is evidence
  // of anything. The Elk's last reading is months old.
  const old = new Date(Date.now() - (STALE_READING_HOURS + 1) * 3_600_000).toISOString();
  const live = await buildLiveConditionsMap(
    fakeSupabase([ELK], [
      { stationId: 'elk-station', gaugeHeightFt: 4.2, dischargeCfs: 1720, at: old },
    ]),
  );
  assert.equal(live.get('elk')?.stale, true);
});

test('a station with no reading at all is stale rather than absent', async () => {
  const live = await buildLiveConditionsMap(fakeSupabase([ELK], []));
  assert.equal(live.get('elk')?.condition_code, 'unknown');
  assert.equal(live.get('elk')?.stale, true);
  assert.equal(live.get('elk')?.reading_age_hours, null);
});
