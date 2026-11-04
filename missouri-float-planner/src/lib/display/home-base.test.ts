import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { RiverListItem } from '@/types/api';
import { RAIN_CHANCE_THRESHOLD } from '@/lib/weather/openweather';
import { MILL_SCENES } from './mill-scenes';
import {
  RAIN_EMPHASIS,
  advanceLoop,
  loopCompleted,
  parseGaugeExtras,
  parseRiverLadders,
  rateSeries,
  risingAt,
  storyCaption,
  STORY_DEFAULT,
  weekStory,
  artRegion,
  BOARD_HEIGHT,
  boardLayout,
  FORECAST_BLOCK,
  growFrame,
  parseForecast,
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

test('one full loop is one display-contract break, with or without the replay', () => {
  for (const [steps, reduce] of [[3, false], [0, false], [3, true]] as const) {
    let s: LoopState = { phase: 'spot', index: 0 };
    let breaks = 0;
    for (let i = 0; i < 40; i++) {
      const next = advanceLoop(s, 2, steps, reduce);
      if (loopCompleted(s, next)) breaks++;
      s = next;
    }
    const loopLength = 2 + (steps && !reduce ? steps : 0) + 1;
    assert.equal(breaks, Math.floor(40 / loopLength), `steps=${steps} reduce=${reduce}`);
  }
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

test('water regions become small boxes with the polygon inside them', () => {
  const r = artRegion('polygon(10% 50%, 20% 50%, 20% 60%)', { width: 1000, height: 600, offsetY: 60 });
  assert.deepEqual({ left: r.left, top: r.top, width: r.width, height: r.height }, { left: 100, top: 240, width: 100, height: 60 });
  assert.equal(r.clipPath, 'polygon(0.0px 0.0px, 100.0px 0.0px, 100.0px 60.0px)');
  assert.throws(() => artRegion('inset(10%)', { width: 1, height: 1, offsetY: 0 }));
  for (const config of Object.values(HOME_BASES)) {
    for (const polygon of [config.water.pool, config.water.falls].filter((p): p is string => !!p)) {
      const box = artRegion(polygon, { width: 1080, height: 607, offsetY: 60 });
      assert.ok(box.width > 0 && box.height > 0 && box.left >= 0 && box.left + box.width <= 1080, `${config.id}: ${polygon}`);
    }
  }
});

test('a 9:16 or wider screen gets the design size; a taller one grows instead of letterboxing', () => {
  const exact = boardLayout(1080, 1920, PINE_VALLEY, true);
  assert.deepEqual(exact, { scale: 1, x: 0, y: 0, height: BOARD_HEIGHT, forecast: false, mapGrow: 0 });
  const wide = boardLayout(1200, 1920, PINE_VALLEY, true);
  assert.equal(wide.height, BOARD_HEIGHT);
  assert.equal(wide.x, 60, 'side bars on a 16:10 screen');
  const ultrawide = boardLayout(1080, 2560, PINE_VALLEY, true);
  assert.equal(ultrawide.forecast, true);
  assert.equal(ultrawide.height, 2560, 'fills a 21:9 screen turned on its side');
  assert.equal(ultrawide.mapGrow, 2560 - BOARD_HEIGHT - FORECAST_BLOCK);
  assert.equal(boardLayout(1440, 3413, PINE_VALLEY, false).forecast, false, 'no forecast data, no forecast card');
  assert.equal(boardLayout(1080, 1990, PINE_VALLEY, true).forecast, false, 'not enough room for the card');
  const extreme = boardLayout(1080, 5000, PINE_VALLEY, true);
  assert.equal(extreme.mapGrow, 2 * PINE_VALLEY.reliefPad, 'never grows past the baked relief');
  assert.ok(extreme.y > 0, 'beyond that, centred');
  assert.equal(boardLayout(0, 0, PINE_VALLEY, true).scale, 0);
});

test('growing the map keeps the place where it was on the ground', () => {
  const grown = growFrame(PINE_VALLEY.map, 200);
  const [, y0] = project(PINE_VALLEY.map, PINE_VALLEY.home.lng, PINE_VALLEY.home.lat);
  const [, y1] = project(grown, PINE_VALLEY.home.lng, PINE_VALLEY.home.lat);
  assert.equal(grown.height, PINE_VALLEY.map.height + 200);
  assert.ok(Math.abs(y1 - (y0 + 100)) < 1e-9);
});

test('the forecast starts today in Central time and drops malformed days', () => {
  const now = Date.UTC(2026, 10, 4, 3); // Tue Nov 3, 9 pm CST
  const { place, days } = parseForecast({
    location: 'Steelville',
    forecast: [
      { date: '2026-11-02', dayOfWeek: 'Mon', tempHigh: 70, tempLow: 50, conditionIcon: '01d', precipitation: 0 },
      { date: '2026-11-03', dayOfWeek: 'Tue', tempHigh: 66.4, tempLow: 60, conditionIcon: '10d', precipitation: 20 },
      { date: '2026-11-04', dayOfWeek: 'Wed', tempHigh: 'warm', tempLow: 51 },
      { date: '2026-11-05', dayOfWeek: 'Thu', tempHigh: 66, tempLow: 47, conditionIcon: '01d', precipitation: 44.4 },
    ],
  }, now);
  assert.equal(place, 'Steelville');
  assert.deepEqual(days.map((d) => d.day), ['Today', 'Thu']);
  assert.equal(days[0].high, 66);
  assert.equal(days[1].rain, 44);
  assert.deepEqual(parseForecast({ error: 'Weather service not configured' }, now), { place: null, days: [] });
});

test("the forecast's rain emphasis matches Eddy's rain-coming threshold", () => {
  assert.equal(RAIN_EMPHASIS, RAIN_CHANCE_THRESHOLD);
});

const thresholds = {
  rivers: [
    { riverSlug: 'jacks-fork', gauges: [
      { usgsId: '07065495', isPrimary: true, unit: 'cfs', thresholds: { tooLow: 40, low: 60, optimalMin: 90, optimalMax: 300, high: 600, dangerous: 1500 } },
      { usgsId: 'x', isPrimary: false, unit: 'ft', thresholds: { tooLow: 1, low: 2, optimalMin: 3, optimalMax: 4, high: 5, dangerous: 6 } },
    ] },
    { riverSlug: 'not-on-board', gauges: [{ isPrimary: true, unit: 'cfs', thresholds: {} }] },
    { riverSlug: 'meramec', gauges: [{ isPrimary: true, unit: 'stage', thresholds: {} }] },
  ],
};

test('ladders come from each river\'s primary gauge, in its own unit', () => {
  const ladders = parseRiverLadders(thresholds, ['jacks-fork', 'meramec']);
  assert.deepEqual([...ladders.keys()], ['jacks-fork'], 'unknown unit and other rivers are skipped');
  assert.equal(ladders.get('jacks-fork')!.levelLow, 60);
  assert.equal(ladders.get('jacks-fork')!.thresholdUnit, 'cfs');
  assert.equal(parseRiverLadders(null, ['jacks-fork']).size, 0);
});

test('the week is rated with Eddy\'s ladder, and never across units', () => {
  const ladder = parseRiverLadders(thresholds, ['jacks-fork']).get('jacks-fork');
  // Eddy's ladder: at or above tooLow is Low, at or above low is Good.
  assert.deepEqual(rateSeries([35, 45, null, 80, 120], 'cfs', ladder), ['too_low', 'low', null, 'good', 'flowing']);
  assert.deepEqual(rateSeries([45, 80], 'ft', ladder), [null, null], 'a stage series is not rated on a discharge ladder');
  assert.deepEqual(rateSeries([45], 'cfs', undefined), [null]);
});

test('the story tells each river\'s sharpest rise and latest change of condition once', () => {
  const end = Date.UTC(2026, 10, 4, 0, 15);
  const flat = Array.from({ length: SERIES_POINTS }, () => 50);
  const jacks = [...flat];
  jacks[SERIES_POINTS - 3] = 50; jacks[SERIES_POINTS - 2] = 60; jacks[SERIES_POINTS - 1] = 80;
  const ratings = new Map([['jacks-fork', jacks.map((v) => (v >= 60 ? 'low' : 'too_low') as 'low' | 'too_low')]]);
  const rivers = [
    { slug: 'huzzah', name: 'Huzzah Creek', sharesGaugeWith: null },
    { slug: 'courtois', name: 'Courtois Creek', sharesGaugeWith: 'Huzzah Creek' },
    { slug: 'jacks-fork', name: 'Jacks Fork River', sharesGaugeWith: null },
  ];
  const series = new Map([['huzzah', flat], ['courtois', jacks], ['jacks-fork', jacks]]);
  const story = weekStory(rivers, series, ratings, end);
  assert.ok(story.events.every((e) => e.slug !== 'courtois'), 'a shared gauge is told once');
  assert.ok(story.events.some((e) => /Jacks Fork up 60% in 6 hours$/.test(e.text)));
  assert.ok(story.events.some((e) => /Jacks Fork turned Low$/.test(e.text)));
  assert.equal(story.summary, 'This week: Jacks Fork rose 60%, the most on the board.');
  assert.match(storyCaption(story, SERIES_POINTS - 1), /Jacks Fork/, 'the last moments are told, not hidden by the summary');
  assert.equal(storyCaption(story, 3), STORY_DEFAULT);
  const quiet = weekStory(rivers.slice(0, 1), new Map([['huzzah', flat]]), new Map(), end);
  assert.deepEqual(quiet, { events: [], summary: 'A quiet week: every river within 5% of where it started.' });
});

test('a pulse runs only on a real rise', () => {
  assert.equal(risingAt([50, 52], 1), true);
  assert.equal(risingAt([50, 51], 1), false);
  assert.equal(risingAt([null, 80], 1), false);
  assert.equal(risingAt([50, 40], 1), false);
});

test('compared-with-usual uses Eddy\'s flow bands; stale water temperature is dropped', () => {
  const now = Date.UTC(2026, 10, 4, 2, 0);
  const detail = (observedAt: string) => ({ gauge: { seasonalContext: { percentile: 44, band: 'normal' }, waterTemperature: { valueF: 64.9, observedAt } } });
  assert.deepEqual(parseGaugeExtras(detail('2026-11-04T01:30:00Z'), now), { band: 'normal', waterF: 65 });
  assert.deepEqual(parseGaugeExtras(detail('2026-11-03T12:00:00Z'), now), { band: 'normal', waterF: null });
  assert.deepEqual(parseGaugeExtras({ gauge: { seasonalContext: null } }, now), { band: null, waterF: null });
  assert.deepEqual(parseGaugeExtras('nope', now), { band: null, waterF: null });
});
