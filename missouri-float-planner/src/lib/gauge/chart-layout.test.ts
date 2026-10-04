import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chartGutters, chartGridValues, placeChartReadout, selectChartRailLabels,
  type ChartRailLabel, type ChartRect,
} from '../../../../eddy-ios/src/lib/gaugeChartLayout';
import { chartEndAfterStartChange, validateChartDates } from '../../../../eddy-ios/src/lib/gaugeChartDates';
import { chartTimeAtX, expandedChartHeight } from '../../../../eddy-ios/src/lib/gaugeChartExpansion';
import { resolveHistoryCapabilities } from '../../../shared/history-capabilities';

test('USGS keeps longer and custom ranges before gauge detail arrives or after it fails', () => {
  for (const detail of [undefined, null]) {
    const capabilities = resolveHistoryCapabilities('usgs', detail);
    assert.equal(capabilities.maxInstantDays, 90);
    assert.equal(capabilities.supportsDaily, true, 'one-year history must remain available');
    assert.equal(capabilities.supportsCustomRange, true);
  }
});

test('switching providers does not carry USGS history options to limited or unknown gauges', () => {
  for (const provider of ['usgs', 'nws', 'usgs', 'usace', undefined, 'future-provider', 'usgs']) {
    const capabilities = resolveHistoryCapabilities(provider);
    assert.equal(capabilities.maxInstantDays, provider === 'usgs' ? 90 : 30);
    assert.equal(capabilities.supportsDaily, provider === 'usgs');
    assert.equal(capabilities.supportsCustomRange, provider === 'usgs');
  }
});

test('an explicit server capability declaration takes precedence over provider defaults', () => {
  const restricted = { maxInstantDays: 7, supportsDaily: false, supportsCustomRange: false };
  assert.deepEqual(resolveHistoryCapabilities('usgs', restricted), restricted);
  const extended = { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true };
  assert.deepEqual(resolveHistoryCapabilities('future-provider', extended), extended);
});

test('portrait and landscape touches resolve to the same instant, including chart insets', () => {
  const start = Date.parse('2026-09-01T00:00:00Z');
  const end = Date.parse('2026-10-01T00:00:00Z');
  for (const width of [264, 334, 720]) {
    for (const fraction of [0, 0.2, 0.5, 0.9, 1]) {
      const x = 16 + 4 + fraction * (width - 8);
      assert.equal(chartTimeAtX(x, 16, width, start, end), start + fraction * (end - start));
    }
    assert.equal(chartTimeAtX(-100, 16, width, start, end), start);
    assert.equal(chartTimeAtX(width + 100, 16, width, start, end), end);
  }
  assert.equal(chartTimeAtX(50, 16, 8, start, end), null, 'unmeasured plots must not select a bogus instant');
  assert.equal(chartTimeAtX(NaN, 16, 334, start, end), null);
});

test('expanded charts fill usable space and retain a readable plot at accessibility sizes', () => {
  assert.equal(expandedChartHeight(720, 132, 44, 1), 532);
  assert.equal(expandedChartHeight(320, 96, 44, 1), 168, 'compact landscape controls leave room without scrolling');
  assert.equal(expandedChartHeight(250, 290, 110, 3), 480, 'large text scrolls instead of crushing the plot');
});

function overlaps(a: ChartRect, b: ChartRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('a high reading puts the readout below it; a low reading puts it above', () => {
  const bounds = { x: 4, y: 0, width: 326, height: 208 };
  const size = { width: 216, height: 88 };
  const high = placeChartReadout(bounds, size, { x: 180, y: 36 })!;
  assert.ok(high.y >= 48);
  const low = placeChartReadout(bounds, size, { x: 180, y: 175 })!;
  assert.ok(low.y + low.height <= 163);
});

test('scrub geometry preserves the selected sample and the fixed chart bounds at phone widths and large type', () => {
  for (const layout of [
    { width: 264, height: 208, tipWidth: 216, tipHeight: 88 },
    { width: 334, height: 208, tipWidth: 216, tipHeight: 88 },
    { width: 374, height: 208, tipWidth: 216, tipHeight: 88 },
    { width: 334, height: 624, tipWidth: 326, tipHeight: 280 },
  ]) {
    const bounds = Object.freeze({ x: 4, y: 0, width: layout.width - 8, height: layout.height });
    for (const x of [40, layout.width / 2, layout.width - 30]) {
      for (const fraction of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const point = { x, y: layout.height * fraction };
        const tip = placeChartReadout(bounds, { width: layout.tipWidth, height: layout.tipHeight }, point, point);
        assert.ok(tip, JSON.stringify({ layout, point }));
        assert.ok(tip.x >= bounds.x && tip.x + tip.width <= bounds.x + bounds.width);
        assert.ok(tip.y >= bounds.y && tip.y + tip.height <= bounds.height);
        assert.equal(overlaps(tip, { x: point.x - 12, y: point.y - 12, width: 24, height: 24 }), false);
      }
    }
  }
});

test('the tooltip moves horizontally away from the finger when there is room', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 208 };
  const size = { width: 120, height: 60 };
  assert.ok(placeChartReadout(bounds, size, { x: 330, y: 30 }, { x: 330, y: 30 })!.x + size.width < 330);
  assert.ok(placeChartReadout(bounds, size, { x: 70, y: 30 }, { x: 70, y: 30 })!.x > 70);
  assert.equal(placeChartReadout(bounds, { width: 500, height: 60 }, { x: 200, y: 100 }), null);
});

test('empty rails reclaim their gutter, while real axis text has enough room', () => {
  const unrated = chartGutters(['700', '750', '800'], [], 11, false);
  assert.equal(unrated.right, 8);
  assert.ok(unrated.left < 40);
  const rated = chartGutters(['700', '750', '800'], ['Good', '700', '↑ Flowing', '1,190'], 11, true);
  assert.ok(334 - rated.left - rated.right >= 225, '390pt phone leaves at least 225pt after page/card insets');
  const long = chartGutters(['-12.50', '102.5k'], [], 22, false);
  assert.ok(long.left >= 6 * 22 * 0.62 + 10);
  assert.ok(long.left > unrated.left, 'large text must grow the numeric gutter');
});

test('rail numbers retain exact positions and choose the closer boundary when labels collide', () => {
  const candidates: ChartRailLabel[] = [
    { id: 'far', kind: 'value', text: '650', y: 145, height: 14, priority: 30 },
    { id: 'near', kind: 'value', text: '700', y: 139, height: 14, priority: 10 },
    { id: 'good', kind: 'name', text: 'Good', y: 70, height: 14, priority: -1 },
    { id: 'above', kind: 'offscreen', text: '↑ Flowing', secondLine: '1,190', y: 15, height: 27, priority: -2 },
    { id: 'clash', kind: 'name', text: 'Flowing', y: 30, height: 14, priority: 2000 },
    { id: 'outside', kind: 'value', text: '500', y: 205, height: 14, priority: 0 },
  ];
  const original = structuredClone(candidates);
  const labels = selectChartRailLabels(candidates, 0, 208);
  assert.deepEqual(labels.map(label => label.id), ['above', 'good', 'near']);
  assert.equal(labels.find(label => label.id === 'near')!.y, 139);
  assert.deepEqual(candidates, original);
  assert.deepEqual(labels, selectChartRailLabels([...candidates].reverse(), 0, 208));
  labels.slice(1).forEach((label, index) => {
    const previous = labels[index];
    assert.ok(label.y - label.height / 2 >= previous.y + previous.height / 2 + 4);
  });
});

test('threshold lines replace gridlines only when they explain the visible scale', () => {
  const domain = { min: 600, max: 900 };
  const ticks = [600, 700, 800, 900];
  assert.deepEqual(chartGridValues(ticks, [650, 800], domain, 150), []);
  assert.equal(chartGridValues(ticks, [], domain, 150).length, 3);
  assert.equal(chartGridValues(ticks, [1190, 2700], domain, 150).length, 3, 'one broad Good band still needs a grid');
  const oneEdge = chartGridValues(ticks, [700], domain, 150);
  assert.deepEqual(oneEdge, [600, 900]);
  assert.ok(!oneEdge.includes(700), 'do not draw a second line on a threshold');
  const crowded = chartGridValues(ticks, [700, 705], domain, 150);
  assert.ok(crowded.length > 0, 'two adjacent thresholds do not explain the whole scale');
});

const NOW = Date.parse('2026-10-01T19:30:00Z');
test('custom-date errors identify invalid fields and reject calendar rollover', () => {
  assert.match(validateChartDates('', '2026-09-10', NOW).errors?.from ?? '', /start date/);
  assert.match(validateChartDates('2026-09-01', '2026-02-30', NOW).errors?.to ?? '', /valid end date/);
  assert.ok(validateChartDates('2026-9-01', '2026-09-30', NOW).errors?.from);
  assert.ok(validateChartDates('2026-02-29', '2026-03-01', NOW).errors?.from);
  assert.ok(validateChartDates('2024-02-29', '2024-03-01', NOW).window);
});

test('reversed, future-start and excessive ranges get specific corrections', () => {
  assert.match(validateChartDates('2026-09-10', '2026-09-01', NOW).errors?.to ?? '', /on or after/);
  assert.match(validateChartDates('2026-10-04', '2026-10-05', NOW).errors?.from ?? '', /today or earlier/);
  assert.match(validateChartDates('2024-01-01', '2026-01-01', NOW).errors?.to ?? '', /366 days/);
});

test('local calendar boundaries preserve selected days across DST and time zones', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Chicago';
    assert.deepEqual(validateChartDates(' 2026-09-01 ', '2026-09-01', NOW), {
      window: { from: '2026-09-01T05:00:00.000Z', to: '2026-09-02T04:59:59.000Z' }, days: 1,
    });
    assert.deepEqual(validateChartDates('2026-03-08', '2026-03-08', NOW), {
      window: { from: '2026-03-08T06:00:00.000Z', to: '2026-03-09T04:59:59.000Z' }, days: 1,
    });
    const later = Date.parse('2026-12-01T18:00:00Z');
    assert.deepEqual(validateChartDates('2026-11-01', '2026-11-01', later), {
      window: { from: '2026-11-01T05:00:00.000Z', to: '2026-11-02T05:59:59.000Z' }, days: 1,
    });
    const justBeforeMidnight = Date.parse('2026-10-02T04:59:00Z');
    assert.ok(validateChartDates('2026-10-02', '2026-10-02', justBeforeMidnight).errors?.from);
    assert.equal(validateChartDates('2026-10-01', '2026-10-10', NOW).window?.to, new Date(NOW).toISOString());
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(validateChartDates('2026-09-01', '2026-09-01', NOW).window?.from, '2026-08-31T12:00:00.000Z');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});


test('moving the chart start past its end keeps a valid one-day range', () => {
  const from = '2026-09-15';
  const to = chartEndAfterStartChange(from, '2026-09-10');
  const result = validateChartDates(from, to, Date.parse('2026-10-01T12:00:00Z'));
  assert.equal(result.errors, undefined);
  assert.equal(result.days, 1);
  assert.equal(chartEndAfterStartChange('2026-09-01', '2026-09-10'), '2026-09-10');
  // Incomplete text on the web must not silently change the other field.
  assert.equal(chartEndAfterStartChange('2026-', '2026-09-10'), '2026-09-10');
});
