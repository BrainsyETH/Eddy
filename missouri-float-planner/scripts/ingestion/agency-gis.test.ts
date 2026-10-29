import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENCY_SOURCES, downloadAgencySnapshot, normalizeAgencySnapshot, type AgencySnapshot } from './agency-gis';

function snapshot(): AgencySnapshot {
  return { source: 'mdc', url: AGENCY_SOURCES.mdc.url, retrieved_at: '2026-10-28T20:00:00Z', count: 1,
    features: [{ attributes: { OBJECTID: 42, Area_ID: 7207, Area_Name: 'Mineral Springs Access', ADA: 'No' },
      geometry: { x: -91.969823, y: 37.363077 } }] };
}

test('MDC identity survives OBJECTID churn and never treats fetch time as verification', () => {
  const a = snapshot(); const b = snapshot(); b.features[0].attributes.OBJECTID = 888;
  const first = normalizeAgencySnapshot(a)[0]; const next = normalizeAgencySnapshot(b)[0];
  assert.equal(first.source_id, next.source_id);
  assert.equal(first.source_verified_at, null);
  assert.equal(first.owner, null);
  assert.ok(!('access_point_id' in first));
  assert.ok(!('approved' in first));
  b.features[0].geometry.x += 0.001;
  assert.notEqual(first.source_id, normalizeAgencySnapshot(b)[0].source_id);
});

test('reject partial snapshots, invalid coordinates, missing identities, and duplicates', () => {
  const a = snapshot(); a.count = 2;
  assert.throws(() => normalizeAgencySnapshot(a), /Incomplete/);
  a.count = 1; a.features[0].geometry.x = NaN;
  assert.throws(() => normalizeAgencySnapshot(a), /coordinate/);
  const b = snapshot(); b.features.push(b.features[0]); b.count = 2;
  assert.throws(() => normalizeAgencySnapshot(b), /Duplicate/);
  const c = snapshot(); delete c.features[0].attributes.Area_ID;
  assert.throws(() => normalizeAgencySnapshot(c), /area ID/);
});

test('AGFC preserves agency dates, ownership, and lake identity without creating launch eligibility', () => {
  const a = snapshot(); a.source = 'agfc'; a.url = AGENCY_SOURCES.agfc.url;
  a.features[0].attributes = { objectid: 4, globalid: '{9996DFE1-F1A8-42FD-B364-19891239EB44}',
    fname: 'Lake Ramp', ftype: 'Boating Access', owner: 'Private', waterbody: 'DeGray Lake',
    last_verified_date: Date.parse('2020-01-01T00:00:00Z'), created_user: 'not-needed' };
  const row = normalizeAgencySnapshot(a)[0];
  assert.equal(row.owner, 'Private'); assert.equal(row.waterbody, 'DeGray Lake');
  assert.equal(row.source_verified_at, '2020-01-01T00:00:00.000Z');
  assert.ok(!('is_float_endpoint' in row)); assert.ok(!('created_user' in row.attributes));
});

test('downloads beyond server limits and rejects repeated, missing, or truncated pages', async () => {
  const ids = Array.from({ length: 401 }, (_, i) => i + 1);
  let batches = 0;
  const query = async (p: Record<string, string>): Promise<Record<string, unknown>> => {
    if (p.returnIdsOnly) return { objectIds: ids };
    batches++;
    return { features: p.objectIds.split(',').map(Number).map((id) => ({
      attributes: { OBJECTID: id, Area_ID: id, Area_Name: `Ramp ${id}` }, geometry: { x: -92, y: 37 },
    })) };
  };
  const result = await downloadAgencySnapshot('mdc', query);
  assert.equal(result.count, 401); assert.equal(batches, 3);
  await assert.rejects(downloadAgencySnapshot('mdc', async (p) => p.returnIdsOnly
    ? { objectIds: [1] } : { features: [], exceededTransferLimit: true }), /truncated/);
  await assert.rejects(downloadAgencySnapshot('mdc', async (p) => p.returnIdsOnly
    ? { objectIds: [1, 2] } : { features: [snapshot().features[0], snapshot().features[0]] }), /source changed/);
});
