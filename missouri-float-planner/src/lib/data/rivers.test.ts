import assert from 'node:assert/strict';
import test from 'node:test';
import { getRivers } from './rivers';

/** Exercise the real Supabase query and API mapper against a paged HTTP fixture. */
async function readCatalog(failSecondPage = false) {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const pages: number[] = [];
  const point = (values = {}) => ({
    river_id: 'meramec', is_float_endpoint: true,
    location_orig: { type: 'Point', coordinates: [-90.453, 38.546] },
    location_snap: { type: 'Point', coordinates: [-91.354, 37.957] }, ...values,
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const resource = url.pathname.split('/').pop();
    let data: unknown;
    if (resource === 'access_points') {
      assert.equal(url.searchParams.get('approved'), 'eq.true');
      assert.equal(url.searchParams.get('select'), 'river_id,is_float_endpoint,location_orig,location_snap');
      assert.equal(url.searchParams.get('order'), 'id.asc');
      assert.equal(url.searchParams.get('limit'), '1000');
      const offset = Number(url.searchParams.get('offset'));
      pages.push(offset);
      if (offset === 1000 && failSecondPage) {
        return new Response(JSON.stringify({ message: 'access lookup failed' }), { status: 400 });
      }
      data = offset === 0
        ? [point(), ...Array.from({ length: 999 }, () => point({ is_float_endpoint: false }))]
        : [point({ location_orig: null }), point({ location_orig: { coordinates: [0, 0] }, location_snap: null }),
          point({ location_orig: { coordinates: [-120, 38] } }),
          point({ river_id: 'big', location_orig: { coordinates: [-90.6, 38.5] } })];
    } else if (resource === 'get_active_rivers_bounds') {
      data = [{ min_lng: -95, min_lat: 35, max_lng: -89, max_lat: 40 }];
    } else if (resource === 'river_gauges') {
      data = [];
    } else if (resource === 'get_river_conditions') {
      data = ['meramec', 'big', 'no-access'].map(river_id => ({
        river_id, condition_code: 'good', condition_label: 'Good', threshold_unit: 'ft',
        gauge_height_ft: 2, discharge_cfs: 200, reading_age_hours: 1,
      }));
    } else if (resource === 'rivers') {
      data = ['meramec', 'big', 'no-access'].map(id => ({
        id, name: id, slug: id, length_miles: '20', state: 'MO',
      }));
    } else {
      throw new Error(`Unexpected query: ${resource}`);
    }
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    return { rivers: await getRivers(), pages };
  } finally {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
}

test('river list pages approved accesses once, retains counts, and emits only usable endpoint coordinates', async () => {
  const { rivers, pages } = await readCatalog();
  assert.deepEqual(pages, [0, 1000]);
  assert.equal(rivers[0].accessPointCount, 1003, 'non-launch places still count on river pages');
  assert.deepEqual(rivers[0].floatAccessCoordinates, [
    { lng: -90.453, lat: 38.546 }, { lng: -91.354, lat: 37.957 },
  ], 'prefer original position, fall back to snapped, reject non-launch and invalid positions');
  assert.deepEqual(rivers[1].floatAccessCoordinates, [{ lng: -90.6, lat: 38.5 }]);
  assert.deepEqual(rivers[2].floatAccessCoordinates, [], 'known no-access is different from unavailable');
});

test('failed access paging never publishes an incomplete proximity catalog', async () => {
  const { rivers, pages } = await readCatalog(true);
  assert.deepEqual(pages, [0, 1000]);
  assert.ok(rivers.every(river => river.floatAccessCoordinates === undefined));
  assert.ok(rivers.every(river => river.currentCondition?.code === 'good'), 'conditions remain available');
});
