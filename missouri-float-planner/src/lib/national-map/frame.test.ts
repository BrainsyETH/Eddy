import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOOD_CODE,
  floodStatusFromCode,
  isFlooding,
  parseNoaaNumber,
  parseNoaaStatus,
  parseNoaaTime,
} from './flood-status';
import {
  buildFrame,
  captureHour,
  decodeFrame,
  FRAME_VERSION,
  KEEP_ALL_HOURS,
  KEEP_HOURLY_DAYS,
  retentionCutoffs,
  type LatestInput,
  type NwsInput,
} from './frame';

const AT = new Date('2026-11-02T05:12:00Z');

const latest = (siteId: string, o: Partial<LatestInput> = {}): LatestInput => ({
  siteId,
  dischargeCfs: 812.345,
  gaugeHeightFt: 4.5678,
  readingTimestamp: '2026-11-02T04:45:00Z',
  suspect: false,
  flowPercentile: 63.6,
  fetchedAt: '2026-11-02T05:05:30Z',
  ...o,
});

const nws = (lid: string, o: Partial<NwsInput> = {}): NwsInput => ({
  lid,
  lng: -90.5,
  lat: 38.5,
  observed: 'minor',
  observedAt: 1793595000,
  observedValue: 19.61,
  units: 'ft',
  forecast: 'not_current',
  forecastValidAt: null,
  forecastIssuedAt: null,
  name: 'Big River at Somewhere',
  ...o,
});

test('NOAA statuses map to our vocabulary without ever inventing "no flooding"', () => {
  assert.equal(parseNoaaStatus('major'), 'major');
  assert.equal(parseNoaaStatus('obs_not_current'), 'not_current');
  assert.equal(parseNoaaStatus('fcst_not_current'), 'not_current');
  assert.equal(parseNoaaStatus('not_defined'), 'not_defined');
  assert.equal(parseNoaaStatus('something_new'), 'unknown');
  assert.equal(parseNoaaStatus(null), 'unknown');
  assert.equal(isFlooding('action'), false, 'action stage is never flooding');
  assert.equal(isFlooding('not_defined'), false);
  assert.equal(isFlooding('minor'), true);
});

test('wire codes are stable — recorded history decodes with this table', () => {
  assert.deepEqual(FLOOD_CODE, {
    unknown: 0, no_flooding: 1, action: 2, minor: 3, moderate: 4, major: 5,
    not_defined: 6, not_current: 7, out_of_service: 8, low_threshold: 9,
  });
  assert.equal(floodStatusFromCode(99), 'unknown');
  assert.equal(floodStatusFromCode('5'), 'unknown');
});

test('NOAA times are UTC and published numbers drop their sentinels', () => {
  assert.equal(parseNoaaTime('2026-11-02 02:54:00'), Date.UTC(2026, 10, 2, 2, 54) / 1000);
  assert.equal(parseNoaaTime(''), null);
  assert.equal(parseNoaaNumber('-999'), null);
  assert.equal(parseNoaaNumber(''), null);
  assert.equal(parseNoaaNumber('19.61'), 19.61);
});

test('a frame round-trips, and a matched NWS point is one identity with its USGS gauge', () => {
  const frame = buildFrame({
    capturedAt: AT,
    latest: [latest('07019000'), latest('07019000', { dischargeCfs: 1 }), latest('bad-id')],
    nws: [nws('EURM7'), nws('ABCD1', { lng: -100, lat: 40 }), nws('eurm7')],
    lidToSite: new Map([['EURM7', '07019000'], ['ABCD1', '99999999']]),
    noaaOk: true,
  });
  assert.equal(frame.v, FRAME_VERSION);
  assert.equal(frame.g.length, 1, 'duplicates and malformed ids are dropped');
  assert.deepEqual(frame.g[0], ['07019000', 812.3, 4.57, Date.parse('2026-11-02T04:45:00Z') / 1000, 0, 64]);
  assert.equal(frame.n.length, 2, 'LIDs are deduplicated case-insensitively');
  const [matched, unmatched] = frame.n;
  assert.equal(matched[10], '07019000');
  assert.equal(matched[11], '', 'a matched point is named by its USGS gauge');
  assert.equal(unmatched[10], null, 'a crosswalk to a station absent from the frame is not a match');
  assert.equal(unmatched[11], 'Big River at Somewhere');
  assert.equal(frame.sources.usgsFetchedAt, '2026-11-02T05:05:30.000Z');

  const decoded = decodeFrame(JSON.parse(JSON.stringify(frame)));
  assert.equal(decoded.capturedAt, AT.getTime());
  assert.equal(decoded.gauges.get('07019000')?.observedAt, Date.parse('2026-11-02T04:45:00Z'));
  assert.equal(decoded.nwsBySite.get('07019000')?.observed, 'minor');
  assert.equal(decoded.nws.find((p) => p.lid === 'ABCD1')?.usgsSiteId, null);
});

test('an unreadable frame throws instead of becoming an empty country', () => {
  assert.throws(() => decodeFrame(null));
  assert.throws(() => decodeFrame({ v: 2, g: [], n: [], capturedAt: AT.toISOString() }));
  assert.throws(() => decodeFrame({ v: 1, capturedAt: AT.toISOString() }));
});

test('a NOAA outage is recorded as an outage', () => {
  const frame = buildFrame({ capturedAt: AT, latest: [latest('07019000')], nws: [], lidToSite: new Map(), noaaOk: false });
  assert.equal(decodeFrame(frame).sources.noaaOk, false);
});

test('retention keeps every capture for a day and one per hour for a week', () => {
  assert.equal(captureHour(new Date('2026-11-02T05:57:12Z')), '2026-11-02T05:00:00.000Z');
  const cut = retentionCutoffs(AT);
  assert.equal(Date.parse(cut.thinBefore), AT.getTime() - KEEP_ALL_HOURS * 3_600_000);
  assert.equal(Date.parse(cut.deleteBefore), AT.getTime() - KEEP_HOURLY_DAYS * 86_400_000);
  assert.ok(KEEP_ALL_HOURS > 24, 'a 24-hour comparison always finds a frame near now-24h');
  assert.ok(KEEP_HOURLY_DAYS >= 7, 'seven-day replay has hourly frames');
});
