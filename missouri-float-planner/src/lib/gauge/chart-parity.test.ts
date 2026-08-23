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

test('the isolated-reading rule covers the forecast series too', () => {
  // chartSegments() returns the lone points of whatever it is handed, and both
  // renderers were calling it for the observed series and throwing the forecast's
  // isolated points away — while the legend went on naming the forecast. A
  // short-range issuance can be a single point.
  for (const [name, source] of RENDERERS) {
    assert.match(source, /forecastDots/, `${name} discards isolated forecast points`);
  }
  // And the attribution is keyed on there BEING a forecast point rather than on a
  // path having been drawn from two or more of them.
  assert.doesNotMatch(web, /forecast\.length > 1/, 'web gates the forecast on a two-point path');
  assert.doesNotMatch(
    app,
    /series\.forecastPaths\.length > 0 \?[\s\S]{0,80}NWS forecast/,
    'app gates its forecast legend on a drawn path',
  );
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

test('the plot itself is announced on both platforms', () => {
  // Neither renderer may leave the chart as an unlabelled box. What each says is
  // platform-shaped — the web's slider speaks the scrubbed reading through
  // aria-valuetext, the app's plot carries a summary — but "nothing at all" is
  // not one of the options on either.
  assert.match(web, /aria-label|aria-valuetext/);
  assert.match(app, /accessibilityLabel=\{plotSummary\}/, 'the app plot has no accessible summary');
  // The summary has to carry the things that are visual and only visual.
  assert.match(app, /NWS forecast included/);
  assert.match(app, /Latest reading \$\{latestQualifiers\}/);
});

test('NWS flood stages come from one visual system, and only onto a feet axis', () => {
  // The violet, the opacity ramp and the dash tightening live in
  // shared/flood-stage.ts (the app reaches it through its theme re-export).
  // Until this release the web chart drew no stages at all, so a national
  // station could show an official flood category on the phone and a bare
  // chart in the browser.
  for (const [name, source] of RENDERERS) {
    assert.match(source, /FLOOD_STAGE_SYSTEM/, `${name} does not draw from the shared flood-stage system`);
    assert.match(source, /floodStageColor\(\)/, `${name} does not take the NWS hue from the system`);
  }
  // The feet-only guard, on each side's own terms. NWPS publishes stages and
  // nothing else — a flood line against discharge puts "flood" at 20 cfs on a
  // river that floods at 20 feet.
  assert.match(app, /!floodStages \|\| drawnUnit !== 'ft'/, 'app lost its feet-axis stage guard');
  assert.match(web, /isFt && floodStages/, 'web lost its feet-axis stage guard');
});

test("threshold shading obeys the ladder's declared unit on both platforms", () => {
  // The band bounds are raw numbers and the drawn series is raw numbers;
  // comparing them is arithmetic that cannot tell feet from cfs. The app has
  // guarded this since the unit toggle shipped; the web type had no unit field
  // at all, so nothing could refuse a mismatch.
  assert.match(app, /thresholds\.thresholdUnit && thresholds\.thresholdUnit !== drawnUnit/);
  assert.match(web, /thresholds\.unit == null \|\| thresholds\.unit === displayUnit/);
});

test('the web scrub is reachable without a pointer', () => {
  // NOT a parity claim — the app has no keyboard, and its scrub is a
  // PanResponder. This is the floor for the platform that does have one: the
  // numbers behind this chart were mouse- and touch-only, which left a keyboard
  // or screen-reader user with a summary label and no way to ask about Tuesday.
  assert.match(web, /role: 'slider'/);
  assert.match(web, /onKeyDown/);
  assert.match(web, /aria-valuetext/);
  // Both key pairs, per the APG slider pattern: a reader who has learned one
  // slider should not have to discover that this one only moves sideways.
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
    assert.match(web, new RegExp(key), `web scrub ignores ${key}`);
  }
  // The advertised bounds are the SELECTABLE instants. The drawn domain also
  // spans the typical band's dates, which Home and End cannot reach.
  assert.match(web, /'aria-valuemin': chartData\.scrubTimes\[0\]/);
  // The card sparkline is the one that must NOT be interactive: it sits inside a
  // next/link, so a drag there competes with the page scroll and with a tap
  // target that navigates away.
  const card = readFileSync(join(process.cwd(), 'src/components/gauge/RiverCard.tsx'), 'utf8');
  assert.match(card, /interactive=\{false\}/);
});
