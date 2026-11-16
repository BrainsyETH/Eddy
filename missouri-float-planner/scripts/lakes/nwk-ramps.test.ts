import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NWK_BOAT_RAMPS_SOURCE, NWK_LAKE_POOLS, RAMP_CAUTION_COPY, assessRamp, normalizeRampSnapshot, rampCaution,
  type Ramp, type RampSnapshot,
} from './nwk-ramps';

const TRUMAN = NWK_LAKE_POOLS.find((l) => l.lake_name === 'Truman Lake')!;

function ramp(overrides: Partial<Ramp> = {}): Ramp {
  return {
    source_id: '0f0f0f0f-0000-4000-8000-000000000001', name: 'Long Shoal', designation: 'Boat Ramp', description: null,
    lake_name: 'Truman Lake', agency: 'USACE', lon: -93.4737, lat: 38.2668,
    ramp_bottom_elev_ft: 704, ramp_closure_elev_ft: 724, source_updated_at: '2024-12-09T00:00:00.000Z', ...overrides,
  };
}

test('normalization requires identity, coordinates and an edit date no later than retrieval', () => {
  const snapshot: RampSnapshot = {
    url: NWK_BOAT_RAMPS_SOURCE.url, retrieved_at: '2026-11-09T18:53:00Z', count: 1,
    features: [{ attributes: { objectid: 1, feat_name: 'Long Shoal', feat_desig: 'Boat Ramp', nwk_lakename_t: 'Truman Lake', agencyid: 'USACE', elev_low: 704, elev_high: 724, globalid: '{0F0F0F0F-0000-4000-8000-000000000001}', last_edited_date: Date.parse('2024-12-09T00:00:00Z') }, geometry: { x: -93.4737, y: 38.2668 } }],
  };
  const [r] = normalizeRampSnapshot(snapshot);
  assert.equal(r.source_id, '0f0f0f0f-0000-4000-8000-000000000001');
  assert.equal(r.ramp_bottom_elev_ft, 704);
  assert.equal(r.ramp_closure_elev_ft, 724);
  assert.equal(r.source_updated_at, '2024-12-09T00:00:00.000Z');
  const future = structuredClone(snapshot);
  future.features[0].attributes.last_edited_date = Date.parse('2027-01-01T00:00:00Z');
  assert.throws(() => normalizeRampSnapshot(future), /edit date/);
  const partial = structuredClone(snapshot); partial.count = 3;
  assert.throws(() => normalizeRampSnapshot(partial), /Incomplete/);
});

test('threshold flags name the anomalies Phase 0 has to check', () => {
  assert.deepEqual(assessRamp(ramp(), TRUMAN), []);
  assert.deepEqual(assessRamp(ramp({ ramp_bottom_elev_ft: null, ramp_closure_elev_ft: null }), TRUMAN), ['no_thresholds']);
  assert.deepEqual(assessRamp(ramp({ ramp_closure_elev_ft: null }), TRUMAN), ['one_threshold_only']);
  assert.deepEqual(assessRamp(ramp({ name: 'Talley Bend (high water ramp)', ramp_bottom_elev_ft: 724, ramp_closure_elev_ft: 727 }), TRUMAN), ['narrow_band']);
  assert.deepEqual(assessRamp(ramp({ name: 'Warsaw City Harbor', ramp_bottom_elev_ft: 645, ramp_closure_elev_ft: 677 }), TRUMAN), ['thresholds_below_this_lake']);
  assert.deepEqual(assessRamp(ramp({ ramp_bottom_elev_ft: 724, ramp_closure_elev_ft: 720 }), TRUMAN), ['closure_not_above_bottom']);
  assert.deepEqual(assessRamp(ramp({ ramp_bottom_elev_ft: 834, ramp_closure_elev_ft: 960 }), NWK_LAKE_POOLS.find((l) => l.lake_name === 'Pomme de Terre Lake')!), ['closure_above_flood_pool']);
});

test('a pool reading produces a caution or nothing, never a clearance, and never across datums', () => {
  assert.equal(rampCaution({ elevation_ft: 703.5, datum: 'NGVD29' }, ramp(), 'NGVD29'), 'low_water');
  assert.equal(rampCaution({ elevation_ft: 725, datum: 'NGVD29' }, ramp(), 'NGVD29'), 'high_water');
  assert.equal(rampCaution({ elevation_ft: 706, datum: 'NGVD29' }, ramp(), 'NGVD29'), null);
  assert.equal(rampCaution({ elevation_ft: 600, datum: 'NGVD29' }, ramp({ ramp_bottom_elev_ft: null }), 'NGVD29'), null, 'no thresholds means no caution and no clearance');
  assert.throws(() => rampCaution({ elevation_ft: 706, datum: 'NAVD88' }, ramp(), 'NGVD29'), /different datums/);
  for (const copy of Object.values(RAMP_CAUTION_COPY)) {
    const all = `${copy.title} ${copy.body} ${copy.basis}`.toLowerCase();
    assert.ok(!/\bavailable\b(?! or)/.test(all.replace('or unavailable', '')), 'caution copy never says a ramp is available');
    assert.ok(!all.includes('usable') && !all.includes('open'), 'caution copy never promotes a status');
    assert.ok(all.includes('not an official closure report'));
  }
});
