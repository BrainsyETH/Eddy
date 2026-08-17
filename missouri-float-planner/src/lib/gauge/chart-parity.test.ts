// src/lib/gauge/chart-parity.test.ts
//
// Asserts the web hydrograph and the app hydrograph are still one chart.
//
// ── Why a test and not a review note ───────────────────────────────────────
// The two renderers have drifted twice, and both times the drawing looked fine.
// First the web chart spaced points by ARRAY INDEX while the app spaced by TIME,
// and plotted a missing reading at mid-frame — same endpoint, same numbers, two
// different stories about when the river peaked. shared/chart-model.ts was
// extracted to end that, and it did, for the functions each side then imported.
//
// The second drift happened inside the fix. The app took `splitAtGaps` and kept
// its own copies of everything else, so:
//
//   · its discharge axis had NO FLOOR — chartDomain() clamps cfs at zero,
//     because negative flow is not a thing, and the app could label the bottom
//     of a low-water plot below it;
//   · it labelled the value axis with the PADDED DOMAIN's min, midpoint and max,
//     so the app printed 1,437.6 where the website printed 1,400;
//   · it had no forecast, no typical range and no qualifiers, all of which the
//     endpoint was already sending to the phone.
//
// chart-model.test.ts pins the model's behaviour and cannot see any of that: it
// tests the functions, and the drift was in who called them. This file reads both
// renderers as text and asserts the calls. It is a coarse instrument on purpose —
// a chart cannot be asserted about without a renderer for each platform, and the
// failure mode being guarded against is not subtle. It is somebody solving a
// charting problem in one file because that file is the one they had open.
//
// Lives here because the Expo app has no test runner of its own, the same
// arrangement as app-worklet-closures.test.ts and app-theme.test.ts.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const WEB_CHART = join(process.cwd(), 'src/components/ui/FlowTrendChart.tsx');
const APP_CHART = join(process.cwd(), '../eddy-ios/src/components/GaugeChart.tsx');
const MODEL = join(process.cwd(), 'shared/chart-model.ts');

const web = readFileSync(WEB_CHART, 'utf8');
const app = readFileSync(APP_CHART, 'utf8');
const model = readFileSync(MODEL, 'utf8');

const RENDERERS: [string, string][] = [
  ['web FlowTrendChart', web],
  ['app GaugeChart', app],
];

/**
 * The model functions a renderer must not answer for itself.
 *
 * Every one of these was duplicated on at least one side at some point, and each
 * duplicate is a decision about what the data MEANS wearing the clothes of a
 * drawing detail: where the axis floors, which reading is under the finger,
 * whether an outage is an outage.
 */
const REQUIRED_MODEL_CALLS = [
  'chartPoints',
  'chartDomain',
  'chartSegments',
  'niceValueTicks',
  'timeTicks',
  'nearestChartPoint',
  'qualifierText',
];

test('both charts draw from the shared chart model', () => {
  for (const [name, source] of RENDERERS) {
    for (const call of REQUIRED_MODEL_CALLS) {
      assert.match(source, new RegExp(`\\b${call}\\b`), `${name} does not use ${call}`);
    }
    assert.match(source, /chart-model/, `${name} does not import the chart model at all`);
  }
});

test('neither chart re-derives the domain it is handed', () => {
  // The app's own min/max scan is the one that lost the cfs floor. Any renderer
  // walking the series to find its own extremes has stopped sharing the axis,
  // whatever it imports elsewhere in the file.
  for (const [name, source] of RENDERERS) {
    assert.doesNotMatch(source, /\bminV\b|\bmaxV\b/, `${name} scans for its own value extremes`);
    assert.doesNotMatch(
      source,
      /\(\s*domain\.max\s*\+\s*domain\.min\s*\)\s*\/\s*2/,
      `${name} labels its value axis with the padded domain's midpoint`,
    );
  }
});

test('the cfs floor and the stage non-floor live in the model, and only there', () => {
  // Stated as an assertion about the model so this file fails loudly if the rule
  // is ever moved into a renderer, where only one platform would get it.
  assert.match(model, /unit === 'cfs' \? 0 : -Infinity/);
  for (const [name, source] of RENDERERS) {
    // Anchored on a domain minimum specifically. A renderer clamping a POINTER
    // fraction to 0–1 is not clamping an axis, and both do the former.
    assert.doesNotMatch(
      source,
      /Math\.max\(\s*0\s*,\s*(?:min\b|minV\b|domain\.min)/,
      `${name} clamps its own axis floor`,
    );
  }
});

test('neither chart discards a reading it cannot join to a line', () => {
  // `filter((segment) => segment.length > 1)` was written on both sides, for the
  // true reason that a lone point is not a line. It made a real reading render as
  // empty space. chartSegments() returns the isolated points; a renderer that
  // filters segments by length is deciding not to draw them again.
  for (const [name, source] of RENDERERS) {
    assert.doesNotMatch(
      source,
      /segment\s*\)\s*=>\s*segment\.length\s*>\s*1/,
      `${name} filters out single-point segments`,
    );
    assert.match(source, /\bisolated\b|\bdots\b/, `${name} never draws isolated readings`);
  }
});

test('both charts draw the official forecast, attribute it, and date it', () => {
  // The endpoint has sent `forecast` and `forecastIssuedAt` to both clients since
  // NWPS replaced AHPS. The app drew neither for a release, so the phone showed a
  // week of history beside an EddyTake paragraph quoting a forecast that was not
  // on the plot.
  for (const [name, source] of RENDERERS) {
    assert.match(source, /forecast/i, `${name} ignores the forecast series`);
    assert.match(source, /NWS forecast/, `${name} draws the forecast without naming NWS`);
    assert.match(source, /forecastIssuedAt/, `${name} never says when the forecast was issued`);
  }
});

test('the qualifier vocabulary is written once, in the model', () => {
  // A qualifier is the gauge telling you how much to trust the number. The web
  // chart owned the only copy of the table, so the app's scrub read out a
  // provisional reading with nothing marking it provisional.
  assert.match(model, /provisional/);
  for (const [name, source] of RENDERERS) {
    assert.doesNotMatch(source, /'provisional'/, `${name} carries its own qualifier copy`);
  }
});

test('the web scrub is reachable without a pointer', () => {
  // NOT a parity claim — the app has no keyboard, and its scrub is a
  // PanResponder. This is the floor for the platform that does have one: the
  // numbers behind this chart were mouse- and touch-only, which left a keyboard
  // or screen-reader user with a summary label and no way to ask about Tuesday.
  assert.match(web, /role: 'slider'/);
  assert.match(web, /onKeyDown/);
  assert.match(web, /aria-valuetext/);
  assert.match(web, /ArrowLeft/);
  // The card sparkline is the one that must NOT be interactive: it sits inside a
  // next/link, so a drag there competes with the page scroll and with a tap
  // target that navigates away.
  const card = readFileSync(join(process.cwd(), 'src/components/gauge/RiverCard.tsx'), 'utf8');
  assert.match(card, /interactive=\{false\}/);
});
