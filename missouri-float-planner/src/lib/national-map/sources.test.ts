import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog, decodeCatalog } from './catalog';
import { mergeNoaa, newestIngest, parseForecastFeatures, parseObservedFeatures } from './noaa-flood';
import { inNationalScope, NATIONAL_STATE_CODES, NATIONAL_STATE_FIPS } from './scope';
import { crosswalk, joinStations, latestInputs } from './station-source';

test('scope is the 50 states and DC; territories are out even without a state code', () => {
  assert.equal(NATIONAL_STATE_CODES.length, 51);
  assert.equal(Object.keys(NATIONAL_STATE_FIPS).length, 51);
  assert.equal(inNationalScope('MO', -90, 38), true);
  assert.equal(inNationalScope(null, -77.03, 38.9), true, 'DC carries no state code');
  assert.equal(inNationalScope('AK', 173.2, 52.9), true, 'the western Aleutians are Alaska');
  assert.equal(inNationalScope('HI', -157.8, 21.3), true);
  assert.equal(inNationalScope('PR', -66.1, 18.4), false);
  assert.equal(inNationalScope(null, -66.1, 18.4), false, 'a Puerto Rico station with no state code');
  assert.equal(inNationalScope(null, -64.9, 18.3), false, 'US Virgin Islands');
  assert.equal(inNationalScope('GU', 144.8, 13.4), false);
  assert.equal(inNationalScope(null, 0, 0), false);
});

test('NOAA observed features parse, territories drop, forecast joins by LID', () => {
  const observed = parseObservedFeatures([
    { attributes: { gaugelid: 'celf1', status: 'minor', waterbody: 'Crescent Lake', location: '', state: 'FL', obstime: '2026-11-02 02:54:00', observed: '2.02', units: 'ft', idp_ingestdate: 1793593090000 }, geometry: { x: -81.5, y: 29.43 } },
    { attributes: { gaugelid: 'SJNP4', status: 'no_flooding', state: 'PR', latitude: 18.4, longitude: -66.1 } },
    { attributes: { gaugelid: 'XXXX1', status: 'not_defined', state: 'MO', latitude: 38, longitude: -91 } },
    { attributes: { status: 'major' }, geometry: { x: -90, y: 38 } },
  ]);
  assert.deepEqual(observed.map((o) => o.lid), ['CELF1', 'XXXX1']);
  assert.equal(observed[0].name, 'Crescent Lake');
  assert.equal(observed[0].observedValue, 2.02);
  assert.equal(newestIngest(observed), new Date(1793593090000).toISOString());

  const forecast = parseForecastFeatures([{ attributes: { gaugelid: 'CELF1', status: 'moderate', fcsttime: '2026-11-04 12:00:00', fcstissunc: '2026-11-02 01:00:00' } }]);
  const merged = mergeNoaa(observed, forecast);
  assert.equal(merged[0].forecast, 'moderate');
  assert.equal(merged[1].forecast, 'unknown', 'no forecast row is unknown, not "no flooding"');
});

test('stations join positions to metadata, keep USGS only, and drop territories', () => {
  const stations = joinStations(
    [
      { id: 'a', site_id: '07019000', curated: true, lng: -90.6, lat: 38.5 },
      { id: 'b', site_id: '50049100', curated: false, lng: -66.1, lat: 18.4 },
      { id: 'c', site_id: 'ABC', curated: false, lng: -90, lat: 38 },
      { id: 'd', site_id: '01646500', curated: false, lng: -77.1, lat: 38.9 },
      { id: 'e', site_id: '99999999', curated: false, lng: -90, lat: 38 },
    ],
    [
      { id: 'a', name: 'Meramec River near Eureka, MO', state_code: 'MO', waterbody_name: 'Meramec River', nws_lid: 'eurm7' },
      { id: 'b', name: 'Rio Grande de Loiza', state_code: null, waterbody_name: null, nws_lid: null },
      { id: 'c', name: 'Not USGS', state_code: 'MO', waterbody_name: null, nws_lid: null },
      { id: 'd', name: 'Potomac River near Wash, DC', state_code: null, waterbody_name: 'Potomac River', nws_lid: 'LTFM2' },
    ],
  );
  assert.deepEqual(stations.map((s) => s.siteId), ['07019000', '01646500']);
  assert.equal(stations[0].nwsLid, 'EURM7');
  assert.deepEqual([...crosswalk(stations)], [['EURM7', '07019000'], ['LTFM2', '01646500']]);

  const inputs = latestInputs(stations, [
    { gauge_station_id: 'a', discharge_cfs: '812.0', gauge_height_ft: null, reading_timestamp: '2026-11-02T04:45:00Z', qualifiers: ['P'], flow_percentile: 40, fetched_at: null },
    { gauge_station_id: 'b', discharge_cfs: 1, gauge_height_ft: 1, reading_timestamp: null, qualifiers: null, flow_percentile: null, fetched_at: null },
  ]);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].dischargeCfs, 812);
});

test('the catalog round-trips and rejects what it cannot read', () => {
  const body = buildCatalog(
    [{ stationId: 'a', siteId: '07019000', name: 'Meramec', stateCode: 'MO', waterbody: null, nwsLid: null, curated: true, lng: -90.123456, lat: 38.5 }],
    new Date('2026-11-02T00:00:00Z'),
  );
  const decoded = decodeCatalog(JSON.parse(JSON.stringify(body)));
  assert.deepEqual(decoded[0], { siteId: '07019000', lng: -90.1235, lat: 38.5, stateCode: 'MO', curated: true, name: 'Meramec', waterbody: null, stages: null });
  // NWS flood stages ride along as an optional 8th element; a missing stage stays null.
  const staged = decodeCatalog(JSON.parse(JSON.stringify(buildCatalog(
    [{ stationId: 'a', siteId: '07019000', name: 'Meramec', stateCode: 'MO', waterbody: null, nwsLid: 'EURM7', curated: true, lng: -90.5, lat: 38.5, stages: [11, 18, 25, null] }],
    new Date('2026-11-02T00:00:00Z'),
  ))));
  assert.deepEqual(staged[0].stages, { action: 11, flood: 18, moderate: 25, major: null });
  assert.throws(() => decodeCatalog({ v: 9, rows: [] }));
});

test('coverage separates missing capability from missing ingestion', async () => {
  const { buildCoverageReport, coverageMarkdown } = await import('./coverage');
  const now = Date.parse('2026-11-02T05:00:00Z');
  const st = (siteId: string, stateCode: string | null, lng: number, lat: number, nwsLid: string | null = null) => ({
    stationId: siteId, siteId, name: siteId, stateCode, waterbody: null, nwsLid, curated: false, lng, lat,
  });
  const report = buildCoverageReport({
    stations: [
      st('00000001', 'MO', -91, 38, 'AAAA1'),
      st('00000002', 'MO', -92, 37),
      st('00000003', 'AK', 173.2, 52.9),
      st('00000004', 'WY', -107, 43),
      st('00000005', null, -77.03, 38.9),
      st('00000006', 'OR', -110.02, 45), // on the pacific-northwest / northern-plains seam
    ],
    latest: [
      { siteId: '00000001', dischargeCfs: 10, gaugeHeightFt: 1, readingTimestamp: '2026-11-02T04:00:00Z', suspect: false, flowPercentile: 40, fetchedAt: null },
      { siteId: '00000002', dischargeCfs: 10, gaugeHeightFt: null, readingTimestamp: '2026-09-01T00:00:00Z', suspect: false, flowPercentile: 40, fetchedAt: null },
      { siteId: '00000003', dischargeCfs: null, gaugeHeightFt: 3, readingTimestamp: '2026-11-02T03:00:00Z', suspect: false, flowPercentile: null, fetchedAt: null },
      { siteId: '00000004', dischargeCfs: 5, gaugeHeightFt: 1, readingTimestamp: '2026-10-20T00:00:00Z', suspect: false, flowPercentile: null, fetchedAt: null },
    ],
    nws: [
      { lid: 'AAAA1', lng: -91, lat: 38, observed: 'no_flooding', observedAt: null, observedValue: null, units: 'ft', forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: 'A' },
      { lid: 'BBBB1', lng: -92, lat: 37, observed: 'not_defined', observedAt: null, observedValue: null, units: 'ft', forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: 'B' },
    ],
    nwsStates: new Map([['AAAA1', 'MO'], ['BBBB1', 'MO']]),
    now,
  });
  const mo = report.states.find((s) => s.state === 'MO')!;
  assert.deepEqual(
    [mo.stations, mo.withLatest, mo.freshDischarge, mo.compared, mo.dormant, mo.nwsPoints, mo.nwsMatched, mo.nwsWithThreshold],
    [2, 2, 1, 1, 1, 2, 1, 1],
  );
  assert.equal(report.states.length, 51);
  assert.equal(report.unassigned.stations, 1, 'DC is reported, not dropped');
  assert.deepEqual(report.aleutiansEastOfAntimeridian, { stations: 1, withLatest: 1 });
  assert.deepEqual(report.seamGaps.map((g) => g.siteId), ['00000006']);
  assert.deepEqual(report.silentStates, ['OR', 'WY']);
  assert.match(coverageMarkdown(report), /\| MO \| 2 \| 2 \| 1 \|/);
});
