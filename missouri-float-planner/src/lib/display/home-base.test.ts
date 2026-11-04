import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { RiverListItem } from '@/types/api';
import { MILL_SCENES } from './mill-scenes';
import {
  advanceLoop,
  boardRows,
  eddyTakeFor,
  formatReading,
  HOME_BASES,
  homeBaseFor,
  isNight,
  loopDelay,
  parseGaugeHistory,
  PINE_VALLEY,
  project,
  relativeLevel,
  riverPageUrl,
  SERIES_POINTS,
  SERIES_STEP_MS,
  sevenDaySeries,
  spotlightOrder,
  stepLabel,
  sunTimes,
  unproject,
  type LoopState,
} from './home-base';

function river(slug: string, name: string, site: string, cfs: number, code = 'good'): RiverListItem {
  return {
    id: slug,
    slug,
    name,
    state: 'MO',
    path: `/rivers/missouri/${slug}`,
    lengthMiles: 30,
    description: null,
    difficultyRating: null,
    region: 'Ozarks',
    riverType: 'spring_fed_float',
    accessPointCount: 5,
    primaryGaugeSiteId: site,
    currentCondition: {
      code,
      label: 'Good',
      thresholdUnit: 'cfs',
      gaugeHeightFt: 2.78,
      dischargeCfs: cfs,
      readingAgeHours: 1,
      trend: { direction: 'rising', label: 'Rising slowly', windowHours: 6 },
    },
  } as RiverListItem;
}

const snapshot = [
  river('courtois', 'Courtois Creek', '07014000', 72.9),
  river('huzzah', 'Huzzah Creek', '07014000', 72.9),
  river('meramec', 'Meramec River', '07013000', 181),
  river('jacks-fork', 'Jacks Fork River', '07065495', 76.9, 'low'),
];

test('every configured board is complete: rivers, lines, labels, mill scene and assets', () => {
  for (const config of Object.values(HOME_BASES)) {
    assert.ok(config.rivers.some((r) => r.slug === config.doorstep), `${config.id}: doorstep is one of its rivers`);
    assert.ok(MILL_SCENES.some((s) => s.id === config.millScene), `${config.id}: mill scene exists`);
    for (const { slug, tip, driveMinutes } of config.rivers) {
      assert.ok(config.lines[slug]?.length > 1, `${config.id}: ${slug} has a line`);
      assert.ok(config.labels[slug], `${config.id}: ${slug} has a label`);
      assert.ok(tip.length > 0 && driveMinutes > 0, `${config.id}: ${slug} has a tip and a drive time`);
    }
    for (const asset of [config.logo.src, `/display/${config.id}/relief.jpg`]) {
      assert.ok(existsSync(join(process.cwd(), 'public', asset)), `${asset} is committed`);
    }
    assert.ok(/^[a-zA-Z0-9_-]{1,30}$/.test(config.campaign), 'campaign is a valid App Store token');
  }
});

test('the place sits inside its own map, and the projection round-trips', () => {
  const { map, home } = PINE_VALLEY;
  const [x, y] = project(map, home.lng, home.lat);
  assert.ok(x > 0 && x < map.width && y > 0 && y < map.height);
  const back = unproject(map, x, y);
  assert.ok(Math.abs(back.lng - home.lng) < 1e-9 && Math.abs(back.lat - home.lat) < 1e-9);
});

test('rows follow configuration order, skip missing rivers and name a shared gauge', () => {
  const rows = boardRows(PINE_VALLEY, snapshot, 0, 0);
  assert.deepEqual(rows.map((r) => r.slug), ['huzzah', 'courtois', 'meramec', 'jacks-fork']);
  assert.equal(rows[0].sharesGaugeWith, null);
  assert.equal(rows[1].sharesGaugeWith, 'Huzzah Creek', 'Courtois is rated from the Huzzah gauge');
  assert.equal(rows[2].sharesGaugeWith, null);
  assert.equal(rows[0].value, '73', 'rated unit and River Window rounding');
  assert.equal(rows[3].code, 'low');
  assert.equal(rows[1].href, 'https://eddy.guide/rivers/missouri/courtois');
});

test('a reading that goes stale loses its condition', () => {
  const rows = boardRows(PINE_VALLEY, snapshot, 0, 30 * 3_600_000);
  assert.ok(rows.every((r) => r.stale && r.code === 'unknown'));
});

test('spotlight runs nearest first', () => {
  const order = spotlightOrder(PINE_VALLEY);
  assert.equal(order[0], 'huzzah');
  const minutes = order.map((s) => PINE_VALLEY.rivers.find((r) => r.slug === s)!.driveMinutes);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b));
});

test('the loop spotlights each river, replays the week, holds, and starts again', () => {
  let s: LoopState = { phase: 'spot', index: 0 };
  const seen: string[] = [];
  for (let i = 0; i < 2 + 3 + 1; i++) {
    seen.push(`${s.phase}${s.index}`);
    s = advanceLoop(s, 2, 3, false);
  }
  assert.deepEqual(seen, ['spot0', 'spot1', 'replay0', 'replay1', 'replay2', 'hold0']);
  assert.deepEqual(s, { phase: 'spot', index: 0 });
  assert.deepEqual(advanceLoop({ phase: 'spot', index: 1 }, 2, 3, true), { phase: 'hold', index: 0 }, 'reduced motion skips the replay');
  assert.deepEqual(advanceLoop({ phase: 'spot', index: 1 }, 2, 0, false), { phase: 'hold', index: 0 }, 'no history, no replay');
  assert.ok(loopDelay({ phase: 'spot', index: 0 }, true) > loopDelay({ phase: 'spot', index: 0 }, false));
});

test('gauge history parsing rejects malformed payloads and keeps order', () => {
  assert.throws(() => parseGaugeHistory({}));
  const parsed = parseGaugeHistory({
    readings: [
      { timestamp: '2026-11-03T02:00:00Z', gaugeHeightFt: 2.7, dischargeCfs: 60 },
      { timestamp: 'nope', dischargeCfs: 1 },
      { timestamp: '2026-11-03T01:00:00Z', gaugeHeightFt: 'x', dischargeCfs: 55 },
    ],
  });
  assert.deepEqual(parsed.map((r) => r.cfs), [55, 60]);
  assert.equal(parsed[0].ft, null);
});

test('the seven-day series keeps gaps as gaps and reads the rated unit', () => {
  const end = Date.UTC(2026, 10, 4, 0, 0);
  const readings = [
    { t: end - 6 * SERIES_STEP_MS, ft: 2.5, cfs: 50 },
    { t: end - 1 * SERIES_STEP_MS, ft: 2.6, cfs: 60 },
    { t: end - 60_000, ft: 2.8, cfs: 73 },
  ];
  const cfs = sevenDaySeries(readings, 'cfs', end);
  assert.equal(cfs.length, SERIES_POINTS);
  assert.equal(cfs[SERIES_POINTS - 1], 73);
  assert.equal(cfs[SERIES_POINTS - 2], 60);
  assert.equal(cfs[SERIES_POINTS - 3], null, 'no reading in that window');
  assert.equal(cfs[SERIES_POINTS - 7], 50);
  assert.equal(cfs[0], null);
  assert.equal(sevenDaySeries(readings, 'ft', end)[SERIES_POINTS - 1], 2.8);
  assert.equal(relativeLevel([50, null, 60, 73], 73), 1);
  assert.equal(relativeLevel([50, 60], null), 0);
});

test('labels read in Central time', () => {
  assert.equal(stepLabel(Date.UTC(2026, 10, 3, 21, 0)), 'Tue 3 pm');
  assert.equal(formatReading(72.94, 'cfs'), '72.9');
  assert.equal(formatReading(1250, 'cfs'), '1,250');
  assert.equal(formatReading(2.784, 'ft'), '2.78');
  assert.equal(formatReading(null, 'cfs'), '—');
});

test('sun times are close to published values, and night means dark at the place', () => {
  const { lat, lng } = PINE_VALLEY.home;
  const { sunrise, sunset } = sunTimes(new Date(Date.UTC(2026, 10, 4, 12)), lat, lng);
  // Published for Dillard, MO on 2026-11-04: about 6:33 am and 5:03 pm CST.
  assert.ok(Math.abs(sunrise - Date.UTC(2026, 10, 4, 12, 33)) < 5 * 60_000);
  assert.ok(Math.abs(sunset - Date.UTC(2026, 10, 4, 23, 3)) < 5 * 60_000);
  assert.equal(isNight(Date.UTC(2026, 10, 4, 18), lat, lng), false, 'noon CST');
  assert.equal(isNight(Date.UTC(2026, 10, 5, 3), lat, lng), true, '9 pm CST');
  assert.equal(isNight(Date.UTC(2026, 10, 5, 10), lat, lng), true, '4 am CST');
});

test("Eddy's take shows only beside the reading it was written from", () => {
  const huzzah = snapshot[1];
  const payload = (cfs: number, code = 'good') => ({ available: true, update: { summaryText: '“Rain is falling now.”', conditionCode: code, gaugeHeightFt: 2.78, dischargeCfs: cfs } });
  assert.equal(eddyTakeFor(payload(72.9), huzzah), 'Rain is falling now.');
  assert.equal(eddyTakeFor(payload(80), huzzah), null, 'a different reading');
  assert.equal(eddyTakeFor(payload(72.9, 'low'), huzzah), null, 'a different condition');
  assert.equal(eddyTakeFor({ available: false, update: null }, huzzah), null);
  assert.equal(eddyTakeFor(payload(72.9), undefined), null);
});

test('unknown boards are not found, and river links use the state path', () => {
  assert.equal(homeBaseFor('nope'), null);
  assert.equal(homeBaseFor('constructor'), null);
  assert.equal(riverPageUrl(PINE_VALLEY, 'huzzah'), 'https://eddy.guide/rivers/missouri/huzzah');
});
