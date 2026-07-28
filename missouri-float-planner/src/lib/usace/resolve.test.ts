import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTsId, pickSeries, type CatalogEntry } from './resolve';

// Pure ranking tests over synthetic catalogs. Every case below is a real
// failure the resolver hit when first run against the live CWMS catalog — the
// scoring looked reasonable on paper and picked wrong data in practice.

const NOW = Date.parse('2026-07-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAhead = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function entry(name: string, latestTime: string | null): CatalogEntry {
  return { name, units: '', latestTime };
}

test('parses a CWMS timeseries id into its six parts', () => {
  const p = parseTsId('Clearwater_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp');
  assert.deepEqual(p, {
    location: 'Clearwater_Dam',
    parameter: 'Flow-Res Out',
    type: 'Ave',
    interval: '1Hour',
    duration: '1Hour',
    version: 'Regi-Comp',
  });
  assert.equal(parseTsId('not.a.tsid'), null);
});

test('a dead forecast series never outranks a live one', () => {
  // MVS lists CWMS-Forecast-16dQPF (last value 2019, zero future points) right
  // beside CWMS-Forecast-NoQPF (runs 11 days ahead). Both names look right.
  // The first version of this resolver skipped the age gate for forecasts
  // entirely and happily picked the dead one.
  const entries = [
    entry('Wappapello Lk.Flow-Out.Inst.1Hour.0.CWMS-Forecast-16dQPF', '2019-03-02T00:00:00Z'),
    entry('Wappapello Lk.Flow-Out.Inst.1Hour.0.CWMS-Forecast-NoQPF', daysAhead(11)),
  ];
  const hit = pickSeries(entries, 'releaseForecast', 'Wappapello Lk', { now: NOW });
  assert.ok(hit);
  assert.match(hit.tsId, /NoQPF$/);
});

test('a forecast whose newest point is in the past is disqualified', () => {
  const entries = [entry('X.Flow-Out.Inst.1Hour.0.CWMS-Forecast-QPF', hoursAgo(2))];
  assert.equal(pickSeries(entries, 'releaseForecast', 'X', { now: NOW }), null);
});

test('a daily observed series gets more slack than an hourly one', () => {
  // MVS publishes observed release as a DAILY average about a day in arrears.
  // A flat 36h gate rejected the correct series and resolved MVS to nothing.
  const daily = [entry('Mark Twain Lk.Flow-Out.Ave.~1Day.1Day.lakerep-rev', hoursAgo(50))];
  assert.ok(pickSeries(daily, 'release', 'Mark Twain Lk', { now: NOW }));

  const hourly = [entry('Mark Twain Lk.Flow-Out.Ave.1Hour.1Hour.lakerep-rev', hoursAgo(50))];
  assert.equal(pickSeries(hourly, 'release', 'Mark Twain Lk', { now: NOW }), null);
});

test('stale observed series are rejected however well they are named', () => {
  const entries = [
    entry('Clearwater_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', '2019-01-01T00:00:00Z'),
  ];
  assert.equal(pickSeries(entries, 'release', 'Clearwater_Dam', { now: NOW }), null);
});

test('an observed metric never resolves to a forecast series', () => {
  const entries = [
    entry('Clearwater_Dam.Flow-Res Out.Ave.~1Day.1Day.Forecast', daysAhead(3)),
  ];
  assert.equal(pickSeries(entries, 'release', 'Clearwater_Dam', { now: NOW }), null);
});

test('prefers the reviewed variant over the raw one', () => {
  const entries = [
    entry('Beaver_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-raw', hoursAgo(1)),
    entry('Beaver_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev', hoursAgo(2)),
  ];
  const hit = pickSeries(entries, 'tailwaterTempF', 'Beaver_Dam', { now: NOW });
  assert.ok(hit);
  // Raw is an hour fresher and still loses: it is not quality-controlled.
  assert.match(hit.tsId, /Decodes-rev$/);
});

test('pool elevation accepts -Headwater (SWL) and the bare location (MVS)', () => {
  const swl = [entry('Table_Rock_Dam-Headwater.Elev.Inst.1Hour.0.Decodes-rev', hoursAgo(1))];
  assert.ok(pickSeries(swl, 'poolElevation', 'Table_Rock_Dam', { now: NOW }));

  const mvs = [entry('Mark Twain Lk-Salt.Elev.Inst.30Minutes.0.lrgsShef-rev', hoursAgo(1))];
  assert.ok(pickSeries(mvs, 'poolElevation', 'Mark Twain Lk-Salt', { now: NOW }));
});

test('a tailwater metric never resolves to a headwater series', () => {
  // Headwater temperature is lake surface temperature. Presenting it as
  // tailwater temperature would tell a trout angler the water is 20 degrees
  // warmer than it is.
  const entries = [entry('Norfork_Dam-Headwater.Temp-Water.Inst.1Hour.0.Decodes-rev', hoursAgo(1))];
  assert.equal(pickSeries(entries, 'tailwaterTempF', 'Norfork_Dam', { now: NOW }), null);
});

test('another project sharing a name prefix cannot be matched', () => {
  // `like` is a prefix regex, so a catalog page for "Beaver_Dam" also returns
  // "Beaver_Dam_Powerhouse". Scoring must anchor on the exact location.
  const entries = [entry('Beaver_Dam_Powerhouse.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', hoursAgo(1))];
  assert.equal(pickSeries(entries, 'release', 'Beaver_Dam', { now: NOW }), null);
});

test('returns null rather than guessing when nothing fits', () => {
  assert.equal(pickSeries([], 'release', 'Whatever', { now: NOW }), null);
  const junk = [entry('Whatever.Precip-Cum.Inst.1Hour.0.Decodes-rev', hoursAgo(1))];
  assert.equal(pickSeries(junk, 'release', 'Whatever', { now: NOW }), null);
});

test('reports which series won and why', () => {
  const entries = [entry('Clearwater_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', hoursAgo(2))];
  const hit = pickSeries(entries, 'release', 'Clearwater_Dam', { now: NOW });
  assert.ok(hit);
  assert.equal(hit.unit, 'cfs');
  assert.equal(hit.reason, 'Flow-Res Out/1Hour/Regi-Comp');
});
