import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DamEmbed from '@/components/embed/v2/DamEmbed';
import type { DamSnapshot } from '../../../shared/dam-types';
import { badgeLayout, damImageModel, riverImageModel } from './image-model';
import { badgeSvg, stripSvg } from './image-svg';
import type { RiverEmbedData } from './river-data';
import { newestTotalRelease, parseEmbedOptions, withNewestRelease } from './options';

const now = Date.parse('2026-10-30T17:30:00Z');

function river(): RiverEmbedData {
  return {
    river: {
      id: 'r1', slug: 'buffalo', name: 'Buffalo National River', path: '/rivers/arkansas/buffalo', state: 'AR',
      lengthMiles: 135, accessPointCount: 20, conditionCode: 'low', conditionLabel: 'Low', thresholdUnit: 'cfs',
    },
    primary: {
      id: 'g1', siteId: '07056000', name: 'Buffalo River near St. Joe, AR', isPrimary: true, provider: 'usgs', rated: true, unit: 'cfs',
      gaugeHeightFt: 2.8, dischargeCfs: 51.9, readingTimestamp: new Date(now - 65 * 60_000).toISOString(),
      readingSuspect: false, qualifierNote: null, conditionCode: 'low', conditionLabel: 'Low',
      ladder: { levelTooLow: 100, levelLow: 356, levelOptimalMin: 356, levelOptimalMax: 2000, levelHigh: 5000, levelDangerous: 12000, unit: 'cfs' },
      optimalRange: '356–2,000 cfs', trend: 'falling', coordinates: null,
    },
    release: null,
    secondary: [],
    take: { text: 'Low but floatable near St. Joe; expect some dragging.', generatedAt: null, conditionCode: null },
    weather: null,
    chart: null,
    assembledAt: now,
  };
}

function dam(): DamSnapshot {
  return {
    id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36, lon: -92,
    hasTurbines: true, generationFloorCfs: 100,
    generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
    metrics: {
      generationFlow: { value: 6600, unit: 'cfs', at: new Date(now - 3600_000).toISOString(), staleness: 'fresh' },
      release: { value: 7200, unit: 'cfs', at: new Date(now - 30 * 60_000).toISOString(), staleness: 'fresh' },
    },
    generating: true,
    schedule: [{ scheduleDate: '2026-10-30', retrievedAt: new Date(now).toISOString(), idle: [],
      hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i < 14 ? 100 : 0, cfs: null, isRamp: false })) }],
    sources: [],
  };
}

test('the river image leads with the rated reading and the canonical condition', () => {
  const m = riverImageModel(river(), { theme: 'light', accent: null }, now);
  assert.equal(m.title, 'Buffalo National River');
  assert.equal(m.status, 'Low');
  assert.equal(m.reading, '52', 'cfs rounds to a whole number');
  assert.equal(m.unit, 'cfs');
  assert.equal(m.trend, '↓');
  assert.equal(m.age, '1h');
  assert.match(m.alt, /Buffalo National River: .*52 cfs.*falling/);
  // The pill takes its colors from the condition system, never from the theme.
  const dark = riverImageModel(river(), { theme: 'dark', accent: '#123456' }, now);
  assert.equal(dark.statusInk, m.statusInk);
  assert.equal(dark.dot, m.dot);
  assert.notEqual(dark.tokens.bg, m.tokens.bg);
});

test('the dam image says what the iOS widget says', () => {
  const m = damImageModel(dam(), { theme: 'light', accent: null }, now);
  assert.equal(m.status, 'Generating');
  assert.equal(m.reading, '7,200');
  assert.equal(m.age, '30m');
  assert.equal(m.readingCurrent, true);
  assert.equal(m.unit, 'cfs');
  assert.match(m.subtitle ?? '', /Generation scheduled until 2 PM/);
  assert.match(m.alt, /Generating.*Total release 7,200 cfs/);
  assert.doesNotMatch(m.alt, /turbine/i);

  const idle = dam();
  idle.metrics.generationFlow = { value: 20, unit: 'cfs', at: new Date(now - 600_000).toISOString(), staleness: 'fresh' };
  assert.equal(damImageModel(idle, { theme: 'light', accent: null }, now).status, 'No generation');

  const silent = dam();
  delete silent.metrics.generationFlow;
  const unavailable = damImageModel(silent, { theme: 'light', accent: null }, now);
  assert.equal(unavailable.status, 'Generation unavailable');
  assert.equal(unavailable.reading, '7,200');
  delete silent.metrics.release;
  assert.equal(damImageModel(silent, { theme: 'light', accent: null }, now).reading, null);

  const oldRelease = dam();
  oldRelease.metrics.release!.at = new Date(now - 4 * 3600_000).toISOString();
  const older = damImageModel(oldRelease, { theme: 'light', accent: null }, now);
  assert.equal(older.status, 'Generating');
  assert.equal(older.readingCurrent, false);
  assert.equal(older.age, '4h');
  assert.match(stripSvg(older), new RegExp(`fill="${older.tokens.muted}" textLength="[^\"]+" lengthAdjust="spacingAndGlyphs">7,200`));
  oldRelease.metrics.release!.dailyMean = true;
  assert.match(damImageModel(oldRelease, { theme: 'light', accent: null }, now).alt, /daily average/);

  // An outdated schedule check: the packet's summary is the home-screen
  // widget's "Open Eddy…" prompt, which an image viewer may have no app for.
  const outdated = dam();
  outdated.schedule[0].retrievedAt = new Date(now - 3 * 3600_000).toISOString();
  const stale = damImageModel(outdated, { theme: 'light', accent: null }, now);
  assert.match(stale.subtitle ?? '', /Total release · The schedule may have changed\./);
  assert.match(stale.alt, /The schedule may have changed\. From Eddy\./);
  assert.doesNotMatch(`${stale.subtitle} ${stale.alt}`, /Open Eddy/);
  outdated.schedule = [];
  assert.match(damImageModel(outdated, { theme: 'light', accent: null }, now).subtitle ?? '', /No schedule posted\./);
});

test('dam HTML widgets lead with release and keep its clock separate from generation', () => {
  const snapshot = dam();
  const render = (size: 'strip' | 'card' | 'full') => renderToStaticMarkup(createElement(DamEmbed, {
    data: { dam: snapshot, powerhouse: true, tailwaterFishery: 'trout', assembledAt: now },
    options: parseEmbedOptions(new URLSearchParams(`size=${size}`)), branding: null, origin: 'https://eddy.guide', now,
  }));
  for (const size of ['strip', 'card', 'full'] as const) {
    const html = render(size);
    assert.match(html, /Total release/);
    assert.match(html, /7,200/);
    assert.match(html, /Generating/);
    assert.doesNotMatch(html, /6,600|turbine flow/i);
    assert.match(html, /30 min ago/);
  }
  snapshot.metrics.release!.at = new Date(now - 4 * 3600_000).toISOString();
  assert.match(render('card'), /ew-reading-value ew-dim/);
  assert.match(render('card'), /Generating/);
  snapshot.metrics.release!.dailyMean = true;
  assert.match(render('full'), /Total release · daily average/);
  delete snapshot.metrics.release;
  assert.match(render('card'), /Release unavailable/);
  assert.doesNotMatch(render('card'), /6,600|7,200/);
  snapshot.metrics.release = { value: 0, unit: 'cfs', at: new Date(now).toISOString(), staleness: 'fresh' };
  assert.match(render('card'), /ew-reading-value">0/);

  // An outdated schedule check gets the embed's own wording, decided from
  // scheduleCurrent rather than by rewriting the widget's sentence.
  snapshot.schedule[0].retrievedAt = new Date(now - 3 * 3600_000).toISOString();
  for (const size of ['strip', 'card', 'full'] as const) {
    const html = render(size);
    assert.match(html, /The schedule may have changed\. Check the full report\./);
    assert.doesNotMatch(html, /Open Eddy/);
  }
  snapshot.schedule = [];
  assert.match(render('strip'), /Schedule · No schedule posted\./);
});

test('svg renders are well formed, sized to their text, and escape the data', () => {
  const data = river();
  data.river.name = 'Big & "Little" <River>';
  const m = riverImageModel(data, { theme: 'light', accent: null }, now);
  const badge = badgeSvg(m);
  assert.match(badge, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="36"/);
  assert.ok(badge.includes('Big &amp; &quot;Little&quot; &lt;River&gt;'));
  assert.ok(!badge.includes('<River>'), 'raw angle brackets never reach the markup');
  assert.ok(badge.endsWith('</svg>'));
  assert.ok(badgeLayout(m).width > 200);
  assert.ok(badgeLayout(riverImageModel({ ...data, river: { ...data.river, name: 'Elk' } }, { theme: 'light', accent: null }, now)).width < badgeLayout(m).width, 'short names make short pills');

  const strip = stripSvg(m, true);
  assert.match(strip, /width="520" height="64"/);
  assert.ok(strip.includes('fill="none"'), 'transparent background');
  assert.ok(strip.includes('>52<'), 'the reading is printed');
  assert.ok(strip.includes('textLength='), 'runs are pinned so a fallback font cannot overflow');
});

test('an unrated dam release is named as the dam\'s release and not called Unknown', () => {
  const data = river();
  data.river.conditionCode = 'unknown';
  data.primary = { ...data.primary!, name: 'White River below Bull Shoals Dam', provider: 'usace', rated: false, conditionCode: 'unknown', trend: null };
  data.release = { damId: 'swl-bull-shoals-dam', damName: 'Bull Shoals Dam' };
  const model = riverImageModel(data, { theme: 'light', accent: null }, now);
  assert.equal(model.subtitle, 'Total release from Bull Shoals Dam');
  assert.equal(model.status, 'Not rated');
  assert.doesNotMatch(model.alt, /Unknown/);
  // A rated river whose reading is missing is still Unknown.
  assert.equal(riverImageModel({ ...river(), river: { ...river().river, conditionCode: 'unknown' } }, { theme: 'light', accent: null }, now).status, 'Unknown');
});

test('both widgets pick the newest total release, whichever table has it', () => {
  const stored = { value: 1807, unit: 'cfs', at: '2026-11-10T20:00:00.000Z' };
  // Snapshot ahead (the :35 cron ran last): the river widget moves to it.
  assert.deepEqual(newestTotalRelease({ value: 1971, at: '2026-11-10T19:00:00Z' }, stored), { value: 1807, at: stored.at, from: 'snapshot' });
  // Gauge table ahead (the :00 cron ran last): the dam widget moves to it.
  assert.deepEqual(newestTotalRelease({ value: 2400, at: '2026-11-10T21:00:00Z' }, stored), { value: 2400, at: '2026-11-10T21:00:00Z', from: 'gauge' });
  // Same hour in both: no change, and the gauge's own figure stands.
  assert.equal(newestTotalRelease({ value: 1807, at: '2026-11-10T20:00:00Z' }, stored)?.from, 'gauge');
  assert.equal(newestTotalRelease(null, stored)?.from, 'snapshot');
  assert.equal(newestTotalRelease({ value: null, at: null }, stored)?.from, 'snapshot');
  assert.equal(newestTotalRelease({ value: 1971, at: '2026-11-10T19:00:00Z' }, { ...stored, dailyMean: true })?.from, 'gauge');
  assert.equal(newestTotalRelease({ value: 1971, at: '2026-11-10T19:00:00Z' }, { ...stored, at: 'soon' })?.from, 'gauge');
  assert.equal(newestTotalRelease(null, null), null);
});

test('the dam widget takes the gauge table\'s release only when it is the newer one, and never touches turbine flow', () => {
  const at = '2026-11-10T20:00:00.000Z';
  const snapshot = { ...dam(), metrics: {
    generationFlow: { value: 1807, unit: 'cfs', at, staleness: 'fresh' as const },
    release: { value: 1807, unit: 'cfs', at, staleness: 'fresh' as const },
  } };
  const ahead = withNewestRelease(snapshot, { value: 2400, at: '2026-11-10T21:00:00Z' });
  assert.equal(ahead.metrics.release?.value, 2400);
  assert.equal(ahead.metrics.release?.at, '2026-11-10T21:00:00Z');
  assert.deepEqual(ahead.metrics.generationFlow, snapshot.metrics.generationFlow);
  // Gauge table behind or level: the snapshot stands, untouched.
  assert.equal(withNewestRelease(snapshot, { value: 1971, at: '2026-11-10T19:00:00Z' }), snapshot);
  assert.equal(withNewestRelease(snapshot, { value: 1807, at }), snapshot);
  assert.equal(withNewestRelease(snapshot, null), snapshot);
  // A daily-mean release is a different quantity; an hourly reading does not replace it.
  const daily = { ...snapshot, metrics: { ...snapshot.metrics, release: { ...snapshot.metrics.release, dailyMean: true } } };
  assert.equal(withNewestRelease(daily, { value: 2400, at: '2026-11-10T21:00:00Z' }), daily);
  // Both widgets land on the same reading in both update orders.
  for (const gauge of [{ value: 1971, at: '2026-11-10T19:00:00Z' }, { value: 2400, at: '2026-11-10T21:00:00Z' }]) {
    const river = newestTotalRelease(gauge, snapshot.metrics.release)!;
    const damSide = withNewestRelease(snapshot, gauge).metrics.release!;
    assert.deepEqual([river.value, Date.parse(river.at)], [damSide.value, Date.parse(damSide.at)]);
  }
});
