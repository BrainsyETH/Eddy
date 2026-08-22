import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasFuturePoint,
  parseTsId,
  periodEndingMs,
  pickSeries,
  rankSeries,
  type CatalogEntry,
} from './resolve';

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

test('a forecast whose catalog timestamp is in the past is still a candidate', () => {
  // This USED to be disqualified on the catalog's word alone. That test had to
  // go: when CWMS froze its catalog timestamps in 2026-07 every forecast series
  // reported a newest point in the past, so the rule disqualified all of them
  // and releaseForecast resolved nowhere. Whether a forecast forecasts is now
  // answered by hasFuturePoint against real data, below.
  const entries = [entry('X.Flow-Out.Inst.1Hour.0.CWMS-Forecast-QPF', hoursAgo(2))];
  assert.ok(pickSeries(entries, 'releaseForecast', 'X', { now: NOW }));
});

test('hasFuturePoint is what separates a live forecast from a retired one', () => {
  // The 16dQPF-vs-NoQPF discrimination, moved off metadata and onto points.
  assert.equal(hasFuturePoint([{ timestamp: NOW - 3_600_000, value: 1 }], NOW), false);
  assert.equal(hasFuturePoint([], NOW), false);
  assert.equal(
    hasFuturePoint(
      [
        { timestamp: NOW - 3_600_000, value: 1 },
        { timestamp: NOW + 86_400_000, value: 2 },
      ],
      NOW
    ),
    true
  );
});

test('a frozen catalog does not stop a live series resolving', () => {
  // The regression this whole rework exists for. Measured 2026-08-02: the
  // catalog reported every SWL/SWT series as last updated 2026-07-27 while
  // /timeseries returned values for the same ids that morning. Under the old
  // 36h gate this entry was disqualified and a monthly mean took its place.
  const entries = [
    entry('Bull_Shoals_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', hoursAgo(145)),
  ];
  const hit = pickSeries(entries, 'release', 'Bull_Shoals_Dam', { now: NOW });
  assert.ok(hit, 'six-day-old catalog metadata must not disqualify an hourly series');
  assert.match(hit.tsId, /Regi-Comp$/);
});

test('a monthly aggregate can never represent a current release', () => {
  // How the bug actually manifested: ~1Month buckets are stamped to the START
  // of a future month, so a monthly mean looked 30 hours old while every hourly
  // series looked six days old. Scoring gave an unlisted interval zero points
  // rather than disqualifying it, so the aggregate won outright.
  const entries = [
    entry('Bull_Shoals_Dam.Flow-Res Out.Ave.~1Month.1Month.CCP-Comp', hoursAgo(30)),
    entry('Bull_Shoals_Dam.Flow-Res Out.Total.~1Month.1Month.CCP-Comp', hoursAgo(30)),
  ];
  assert.equal(
    pickSeries(entries, 'release', 'Bull_Shoals_Dam', { now: NOW }),
    null,
    'a monthly mean is not an answer to "what is it releasing", even alone'
  );
});

test('stale observed series are rejected however well they are named', () => {
  // Still true, and still the reason the catalog timestamp is read at all:
  // Bull Shoals lists a CCP-Comp release series that stopped in Feb 2020 right
  // beside the live Regi-Comp one. The liveness floor is what buries it.
  const entries = [
    entry('Clearwater_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', '2019-01-01T00:00:00Z'),
  ];
  assert.equal(pickSeries(entries, 'release', 'Clearwater_Dam', { now: NOW }), null);

  const corpse = [
    entry('Bull_Shoals_Dam.Flow-Res Out.Ave.1Hour.1Hour.CCP-Comp', '2020-02-03T06:00:00Z'),
  ];
  assert.equal(pickSeries(corpse, 'release', 'Bull_Shoals_Dam', { now: NOW }), null);
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

test('tailwater elevation accepts Elev-Tailwater but never the bare pool', () => {
  // The pair model exists for exactly this. SWT publishes tailwater elevation
  // as `TENK.Elev-Tailwater` on the BARE location, so reaching it with a
  // subLocation list would also admit `TENK.Elev` — the pool. Measured
  // 2026-08-02: pool 632.94 ft, tailwater 482.86 ft.
  const swt = [entry('TENK.Elev-Tailwater.Inst.1Hour.0.Ccp-Rev', hoursAgo(1))];
  const hit = pickSeries(swt, 'tailwaterElevation', 'TENK', { now: NOW });
  assert.ok(hit);
  assert.match(hit.tsId, /Elev-Tailwater/);

  const pool = [entry('TENK.Elev.Inst.1Hour.0.Ccp-Rev', hoursAgo(1))];
  assert.equal(
    pickSeries(pool, 'tailwaterElevation', 'TENK', { now: NOW }),
    null,
    'bare Elev is the pool and must never be served as tailwater elevation'
  );
  // The same entry IS the right answer for pool elevation.
  assert.ok(pickSeries(pool, 'poolElevation', 'TENK', { now: NOW }));
});

test('district spellings of turbine flow and flood pool both resolve', () => {
  // SWL says Flow-Plant / %-Flood Pool; SWT says Flow-Power / %-Flood Pool Full.
  // Exact parameter matching meant the SWL names could never reach Tulsa's.
  const swt = [
    entry('TENK.Flow-Power.Ave.1Hour.1Hour.Rev-Regi-Flowgroup', hoursAgo(1)),
    entry('TENK.%-Flood Pool Full.Inst.1Hour.0.Ccp-Rev', hoursAgo(1)),
  ];
  assert.match(pickSeries(swt, 'generationFlow', 'TENK', { now: NOW })!.tsId, /Flow-Power/);
  assert.match(pickSeries(swt, 'pctFloodPool', 'TENK', { now: NOW })!.tsId, /Flood Pool Full/);

  const swl = [
    entry('Table_Rock_Dam.Flow-Plant.Ave.1Hour.1Hour.CCP-Comp', hoursAgo(1)),
    entry('Table_Rock_Dam-Headwater.%-Flood Pool.Inst.1Hour.0.CCP-Comp', hoursAgo(1)),
  ];
  assert.match(pickSeries(swl, 'generationFlow', 'Table_Rock_Dam', { now: NOW })!.tsId, /Flow-Plant/);
  assert.ok(pickSeries(swl, 'pctFloodPool', 'Table_Rock_Dam', { now: NOW }));
});

test('LRN vocabulary resolves across a project’s split station namespaces', () => {
  // Nashville hangs observed series off two NWS-handbook stations per project
  // and its forecast off a prose name — the case cdaLocations exists for.
  // One catalog pool, three base locations, each metric found where the
  // district actually put it. Every id below was verified live 2026-08-15.
  const locations = ['RWNK2-WOLF_CREEK', 'WLCK2-WOLF_CREEK', 'Wolf Creek Dam'];
  const entries = [
    entry('RWNK2-WOLF_CREEK.Flow.Ave.1Hour.1Hour.man-rev', hoursAgo(1)),
    entry('RWNK2-WOLF_CREEK.Flow-Turbine.Ave.1Hour.1Hour.man-rev', hoursAgo(1)),
    entry('RWNK2-WOLF_CREEK.Elev-Tail.Inst.1Hour.0.man-rev', hoursAgo(1)),
    entry('WLCK2-WOLF_CREEK.Elev-Pool.Inst.1Hour.0.man-rev', hoursAgo(1)),
    entry('WLCK2-WOLF_CREEK.Flow-In.Ave.1Hour.1Hour.man-rev', hoursAgo(1)),
    entry('Wolf Creek Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast', daysAhead(9)),
  ];

  assert.match(pickSeries(entries, 'release', locations, { now: NOW })!.tsId, /^RWNK2.*\.Flow\./);
  assert.match(pickSeries(entries, 'generationFlow', locations, { now: NOW })!.tsId, /Flow-Turbine/);
  assert.match(pickSeries(entries, 'tailwaterElevation', locations, { now: NOW })!.tsId, /Elev-Tail/);
  assert.match(pickSeries(entries, 'poolElevation', locations, { now: NOW })!.tsId, /Elev-Pool/);
  assert.match(pickSeries(entries, 'inflow', locations, { now: NOW })!.tsId, /Flow-In/);
  assert.match(
    pickSeries(entries, 'generationForecast', locations, { now: NOW })!.tsId,
    /-Turbines\.Flow\..*forecast$/
  );
});

test('bare Flow is the last resort, and never reaches past the listed locations', () => {
  // Bare `Flow` is the one generic parameter in SPECS, admitted for LRN's
  // station naming. Two things must hold: a district-specific spelling always
  // outranks it where both exist, and the exact-location discipline still
  // applies — a station outside the list cannot be matched however right its
  // parameter looks.
  const both = [
    entry('Table_Rock_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp', hoursAgo(1)),
    entry('Table_Rock_Dam.Flow.Ave.1Hour.1Hour.Regi-Comp', hoursAgo(1)),
  ];
  assert.match(
    pickSeries(both, 'release', 'Table_Rock_Dam', { now: NOW })!.tsId,
    /Flow-Res Out/,
    'the specific spelling must outrank bare Flow'
  );

  const elsewhere = [entry('BYGT1-WolfR-ByrdstownTN.Flow.Inst.30Minutes.0.dcp-rev', hoursAgo(1))];
  assert.equal(
    pickSeries(elsewhere, 'release', ['RWNK2-WOLF_CREEK', 'WLCK2-WOLF_CREEK'], { now: NOW }),
    null,
    'a station not in the list is not this dam’s water'
  );
});

test('the generation forecast never resolves to an observation, nor the reverse', () => {
  // The forecast/observed split is the plan-versus-record line: the same
  // parameter spelling exists on both sides at LRN, and only the version
  // separates them.
  const entries = [
    entry('RWNK2-WOLF_CREEK.Flow-Turbine.Ave.1Hour.1Hour.man-rev', hoursAgo(1)),
    entry('Wolf Creek Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast', daysAhead(9)),
  ];
  const locations = ['RWNK2-WOLF_CREEK', 'Wolf Creek Dam'];
  assert.match(
    pickSeries(entries, 'generationForecast', locations, { now: NOW })!.tsId,
    /forecast$/
  );
  assert.match(
    pickSeries(entries, 'generationFlow', locations, { now: NOW })!.tsId,
    /man-rev$/
  );
});

test('rankSeries offers fallbacks in order so a dead favourite can be skipped', () => {
  // resolveSeries probes candidates in this order; without more than one there
  // is nothing to fall through to when the best-named series returns no value.
  const entries = [
    entry('TENK.Flow-Res Out.Ave.1Hour.1Hour.Rev-Regi-Flowgroup', hoursAgo(1)),
    entry('TENK.Flow-Res Out.Ave.~1Day.1Day.Rev-Regi-Flowgroup', hoursAgo(1)),
  ];
  const ranked = rankSeries(entries, 'release', 'TENK', { now: NOW });
  assert.equal(ranked.length, 2);
  assert.match(ranked[0].tsId, /1Hour/, 'hourly outranks daily');
  assert.match(ranked[1].tsId, /~1Day/);
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

// ── Period-ending duration ─────────────────────────────────────────────────
// What tells the history writer whether a stamp is a moment or the end of an
// hour. Getting it backwards drew the whole pattern strip an hour late.

test('a duration of zero is an instant, whatever the interval says', () => {
  // The trap this exists for: `Inst.1Hour.0` arrives hourly and summarises
  // nothing. Reading the INTERVAL would call it an hourly average and shift it.
  assert.equal(periodEndingMs('TENK.Flow-Power.Inst.1Hour.0.Rev-Regi-Flowgroup'), 0);
  assert.equal(periodEndingMs('WLCK2-WOLF_CREEK.Elev-Pool.Inst.1Hour.0.man-rev'), 0);
  assert.equal(periodEndingMs('CETT1-CENTER_HILL.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev'), 0);
});

test('a non-zero duration is the period the stamp closes', () => {
  assert.equal(periodEndingMs('TENK.Flow-Power.Ave.1Hour.1Hour.Rev-Regi-Flowgroup'), 3_600_000);
  assert.equal(
    periodEndingMs('RWNK2-WOLF_CREEK.Flow-Turbine.Ave.1Hour.1Hour.man-rev'),
    3_600_000
  );
  assert.equal(periodEndingMs('Wappapello Lk-St Francis.Flow-Out.Ave.~1Day.1Day.lakerep-rev'), 86_400_000);
  assert.equal(periodEndingMs('SOME.Flow.Ave.15Minutes.15Minutes.rev'), 900_000);
});

test('an unreadable id shifts nothing rather than guessing', () => {
  // A series whose duration we cannot parse is left where its stamp puts it.
  // Moving it by a guess would be the same class of error in a new place.
  assert.equal(periodEndingMs('not-a-ts-id'), 0);
  assert.equal(periodEndingMs('A.B.Ave.1Hour.Unknown.rev'), 0);
});

test('the two Tenkiller siblings are told apart', () => {
  // They differ only in type and duration, and both are live. This pair is the
  // reason the discrimination has to be exact: they score identically in
  // rankSeries and the alphabetical tie-break picks `Ave`.
  const ave = 'TENK.Flow-Power.Ave.1Hour.1Hour.Rev-Regi-Flowgroup';
  const inst = 'TENK.Flow-Power.Inst.1Hour.0.Rev-Regi-Flowgroup';
  assert.equal(parseTsId(ave)?.duration, '1Hour');
  assert.equal(parseTsId(inst)?.duration, '0');
  assert.notEqual(periodEndingMs(ave), periodEndingMs(inst));
});
