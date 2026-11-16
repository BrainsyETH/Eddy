import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFrame, decodeFrame, type LatestInput } from './frame';
import { calibrationMarkdown, frameRatios, frameStageDeltas, ratioStats, sizeBucket, stageStats } from './change-calibration';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const H = 3_600_000;
const reading = (siteId: string, at: number, q: number | null, o: Partial<LatestInput> = {}): LatestInput => ({
  siteId, dischargeCfs: q, gaugeHeightFt: 3, readingTimestamp: new Date(at - 0.3 * H).toISOString(), suspect: false, flowPercentile: 50, fetchedAt: new Date(at).toISOString(), ...o,
});
const frame = (at: number, latest: LatestInput[]) =>
  decodeFrame(buildFrame({ capturedAt: new Date(at), latest, nws: [], lidToSite: new Map(), noaaOk: true }));

test('ratios use the view’s floor and skip flagged or stale readings', () => {
  const then = frame(NOW - 24 * H, [reading('07000001', NOW - 24 * H, 100), reading('07000002', NOW - 24 * H, 100, { suspect: true }), reading('07000003', NOW - 24 * H, 0)]);
  const now = frame(NOW, [reading('07000001', NOW, 300), reading('07000002', NOW, 300), reading('07000003', NOW, 0.5)]);
  const r = frameRatios(now, then);
  assert.equal(r.size, 2);
  assert.ok(Math.abs(r.get('07000001')! - 301 / 101) < 1e-9);
  assert.equal(r.get('07000003'), 1.5, 'a trickle from 0 to 0.5 cfs is 1.5× with the floor, not infinite');
});

test('shares add up and percentiles order', () => {
  const ratios = [0.3, 0.6, 0.9, 1, 1, 1.1, 1.6, 3.5, 40];
  const s = ratioStats(ratios, '24h');
  const total = s.share.risingFast + s.share.rising + s.share.steady + s.share.falling + s.share.fallingFast + s.share.implausible;
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(s.p[1] <= s.p[50] && s.p[50] <= s.p[99]);
  assert.equal(s.share.implausible, 1 / 9);
});

test('river size buckets and the report table', () => {
  assert.equal(sizeBucket(null), 'unknown size');
  assert.equal(sizeBucket(50), 'small (<100 sq mi)');
  assert.equal(sizeBucket(25000), 'very large (>10,000)');
  const then = frame(NOW - 24 * H, [reading('07000001', NOW - 24 * H, 100)]);
  const now = frame(NOW, [reading('07000001', NOW, 160)]);
  const md = calibrationMarkdown('24h', now, then, new Map([['07000001', 500]]));
  assert.match(md, /\| all gauges \| 1 \|/);
  assert.match(md, /\| medium \(100–1,000\) \| 1 \|/);
});

test('stage-only gauges are compared in feet, in their own table', () => {
  const then = frame(NOW - 6 * H, [
    reading('07000001', NOW - 6 * H, 100),
    reading('07000002', NOW - 6 * H, null, { gaugeHeightFt: 4 }),
    reading('07000003', NOW - 6 * H, null, { gaugeHeightFt: 4 }),
    reading('07000004', NOW - 6 * H, null, { gaugeHeightFt: 4, suspect: true }),
  ]);
  const now = frame(NOW, [
    reading('07000001', NOW, 110),
    reading('07000002', NOW, null, { gaugeHeightFt: 5.5 }),
    reading('07000003', NOW, null, { gaugeHeightFt: 3.9 }),
    reading('07000004', NOW, null, { gaugeHeightFt: 9 }),
  ]);
  const d = frameStageDeltas(now, then);
  assert.deepEqual([...d.keys()].sort(), ['07000002', '07000003'], 'discharge gauges and flagged readings are not stage comparisons');
  assert.equal(d.get('07000002'), 1.5);
  const s = stageStats([...d.values()], '6h');
  assert.equal(s.share.risingFast, 0.5, '+1.5 ft in 6 h is sharply rising (≥ 1 ft)');
  assert.equal(s.share.steady, 0.5);
  const md = calibrationMarkdown('6h', now, then, new Map());
  assert.match(md, /\| stage-only \| 2 \| /);
  assert.match(md, /Regulated releases are not separated/);
});
