import assert from 'node:assert/strict';
import test from 'node:test';
import type { DamSnapshot } from '../../../shared/dam-types';
import { badgeLayout, damImageModel, riverImageModel } from './image-model';
import { badgeSvg, stripSvg } from './image-svg';
import type { RiverEmbedData } from './river-data';

const now = Date.parse('2026-10-30T17:30:00Z');

function river(): RiverEmbedData {
  return {
    river: {
      id: 'r1', slug: 'buffalo', name: 'Buffalo National River', path: '/rivers/arkansas/buffalo', state: 'AR',
      lengthMiles: 135, accessPointCount: 20, conditionCode: 'low', conditionLabel: 'Low', thresholdUnit: 'cfs',
    },
    primary: {
      id: 'g1', siteId: '07056000', name: 'Buffalo River near St. Joe, AR', isPrimary: true, unit: 'cfs',
      gaugeHeightFt: 2.8, dischargeCfs: 51.9, readingTimestamp: new Date(now - 65 * 60_000).toISOString(),
      readingSuspect: false, qualifierNote: null, conditionCode: 'low', conditionLabel: 'Low',
      ladder: { levelTooLow: 100, levelLow: 356, levelOptimalMin: 356, levelOptimalMax: 2000, levelHigh: 5000, levelDangerous: 12000, unit: 'cfs' },
      optimalRange: '356–2,000 cfs', trend: 'falling', coordinates: null,
    },
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
    metrics: { generationFlow: { value: 6600, unit: 'cfs', at: new Date(now - 3600_000).toISOString(), staleness: 'fresh' } },
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
  assert.equal(m.reading, '6,600');
  assert.equal(m.unit, 'cfs');
  assert.match(m.subtitle ?? '', /Stops at 2 PM/);
  assert.match(m.alt, /Generating now/);

  const idle = dam();
  idle.metrics.generationFlow = { value: 20, unit: 'cfs', at: new Date(now - 600_000).toISOString(), staleness: 'fresh' };
  assert.equal(damImageModel(idle, { theme: 'light', accent: null }, now).status, 'No generation');

  const silent = dam();
  delete silent.metrics.generationFlow;
  const unavailable = damImageModel(silent, { theme: 'light', accent: null }, now);
  assert.equal(unavailable.status, 'Unavailable');
  assert.equal(unavailable.reading, null);
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
