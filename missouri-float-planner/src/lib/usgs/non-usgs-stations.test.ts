import assert from 'node:assert/strict';
import test from 'node:test';
import { withUsgsGaugesOnly, type MODatasetRaw } from './mo-statewide-data';
import { usgsSiteIds } from '../flow-providers/usgs';
import { classifyQualifiers } from './gauges';

// ── Non-USGS stations must never reach waterservices.usgs.gov ──────────
//
// This is a regression suite for a real outage, and the shape of the failure is
// the reason it is worth a file. Migration 00198 registers USACE dam releases
// as gauge stations keyed on `site_id_external`, so their `usgs_site_id` is
// NULL. The statewide dataset RPC selects that column unfiltered, and the null
// travelled all the way to the USGS batch request.
//
// A null site id does NOT come back empty for its own station. The modern
// transport throws on `null.startsWith`; the legacy one is worse, because
// join(',') produces `sites=07064533,,07067000` and waterservices answers 400
// for EVERY site in the request. So one dam row emptied the readings for all 24
// rivers, /api/usgs/mo-statewide 500'd, and both maps painted the entire state
// `unknown` grey.
//
// Two independent guards, tested independently: the dataset never emits such a
// gauge, and the provider refuses to send one even if something else does.

function river(gauges: { site_id: string | null; name: string }[]): MODatasetRaw['rivers'][number] {
  return {
    id: 'r1',
    slug: 'black',
    name: 'Black River',
    region: 'Ozarks',
    length_miles: 100,
    geometry: { type: 'LineString', coordinates: [[-91, 37], [-90, 37]] },
    access_points: null,
    pois: null,
    // Only the two fields under test are real; the rest of MOGauge is not read
    // by the filter and standing it up in full would test the fixture.
    gauges: gauges as unknown as MODatasetRaw['rivers'][number]['gauges'],
  };
}

function dataset(rivers: MODatasetRaw['rivers']): MODatasetRaw {
  return { rivers, campgrounds: [], generated_at: '2026-07-28T00:00:00Z' };
}

test('a gauge with a null site id is dropped from the dataset', () => {
  const out = withUsgsGaugesOnly(
    dataset([
      river([
        { site_id: '07061500', name: 'Black River at Poplar Bluff' },
        // Clearwater Dam, exactly as migration 00198 registers it.
        { site_id: null, name: 'Black River below Clearwater Dam' },
      ]),
    ]),
  );

  assert.deepEqual(
    out.rivers[0].gauges?.map((g) => g.site_id),
    ['07061500'],
  );
});

test('an empty or whitespace site id is dropped too', () => {
  const out = withUsgsGaugesOnly(
    dataset([river([{ site_id: '' , name: 'blank' }, { site_id: '   ', name: 'spaces' }])]),
  );
  assert.deepEqual(out.rivers[0].gauges, []);
});

test('rivers with no gauges at all stay null rather than becoming an empty array', () => {
  // `gauges: null` and `gauges: []` are different answers — the first is "this
  // river has no gauge wired up", and callers branch on it.
  const out = withUsgsGaugesOnly(dataset([{ ...river([]), gauges: null }]));
  assert.equal(out.rivers[0].gauges, null);
});

test('a fully-USGS river is passed through untouched', () => {
  const input = dataset([
    river([
      { site_id: '07064533', name: 'Current above Akers' },
      { site_id: '07067000', name: 'Current at Van Buren' },
    ]),
  ]);
  const out = withUsgsGaugesOnly(input);
  assert.equal(out.rivers[0].gauges?.length, 2);
  assert.equal(out.generated_at, input.generated_at);
});

// ── The provider's own floor ───────────────────────────────────────────

test('usgsSiteIds strips the entries that poison a batch', () => {
  assert.deepEqual(
    usgsSiteIds(['07064533', null, '', undefined, '  ', '07067000']),
    ['07064533', '07067000'],
  );
});

test('usgsSiteIds keeps a list that is already clean, in order', () => {
  const clean = ['07064533', '07066510', '07068000'];
  assert.deepEqual(usgsSiteIds(clean), clean);
});

test('provisional qualifier copy names the station provider', () => {
  assert.equal(classifyQualifiers(['P'], 'usgs').note, 'Provisional USGS data');
  assert.equal(classifyQualifiers(['P'], 'usace').note, 'Provisional USACE data');
  assert.equal(classifyQualifiers(['P'], 'nws').note, 'Provisional NWS data');
});

test('unknown provider copy does not guess USGS', () => {
  assert.equal(classifyQualifiers(['P'], null).note, 'Provisional provider data');
  assert.equal(
    classifyQualifiers(['Rat'], null).note,
    'Reading flagged by provider — may be inaccurate',
  );
});
