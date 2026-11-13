import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import broadfoot from './fixtures/recgov-details-broadfoot.json';
import buffalo from './fixtures/recgov-details-buffalo.json';
import { recreationSiteDetails, fetchRecreationSiteDetails } from './site-details';
import { GET } from '../../app/api/campsites/details/route';
import { navigationCacheTtl } from '../../../../eddy-ios/src/lib/requestPool';

test('Broadfoot source fields become concise site facts, without ratings or repeated capacity', () => {
  const details = recreationSiteDetails(broadfoot, '10344948', '10344971');
  assert.deepEqual(details.facts, [
    { key: 'setting', label: 'Setting', value: 'Riverfront · Shaded' },
    { key: 'access', label: 'Access', value: 'Drive-In · Back-in · 2 vehicles max' },
    { key: 'equipment', label: 'Equipment', value: 'Tent · RV up to 40 ft' },
    { key: 'amenities', label: 'At this site', value: 'Fire ring · Picnic table · Lantern post' },
    { key: 'arrival', label: 'Arrival', value: 'In 1:00 PM · Out 12:00 PM' },
    { key: 'pets', label: 'Pets', value: 'Allowed' },
  ]);
  assert.equal(details.sourceUrl, 'https://www.recreation.gov/camping/campsites/10344971');
  assert.deepEqual(details.notes, []);
});

test('Buffalo keeps site restrictions and specific hookups without claiming shared amenities are on the site', () => {
  const details = recreationSiteDetails(buffalo, '234043', '6506');
  assert.equal(details.facts.find(f => f.key === 'hookups')?.value, '20/30/50-amp electric · Water hookup');
  assert.equal(details.facts.find(f => f.key === 'amenities')?.value, 'Fire ring · Picnic table');
  assert.match(details.facts.find(f => f.key === 'equipment')!.value, /RV, Trailer.*47 ft/);
  assert.doesNotMatch(JSON.stringify(details.facts), /Tent|showers|Dump Station|Flush Toilets|campfire.allowed/i);
  assert.equal(details.notes[0], 'Sites B30 - B35 are not suitable for tents.');
  assert.equal(details.notes.length, 4);
  assert.ok(details.notes.every(note => !/<\/?(?:p|a|script)\b/i.test(note)));
});

test('absent or unknown facts stay absent; explicit negative facts and accessible sites remain useful', () => {
  const site = { campsite_id: '1', facility_id: '2', is_accessible: true,
    site_details_map: { shade: { attribute_value: 'No' }, pets_allowed: { attribute_value: 'No' }, water_hookup: { attribute_value: 'Unknown' } },
    attributes: [{ attribute_code: 'water_hookup', attribute_value: 'Yes' }],
    permitted_equipment: [{ equipment_name: 'RV', max_length: 0 }, { equipment_name: 'Tent', is_deactivated: true }],
    amenities: [{ attribute_name: 'Picnic Tables' }, { attribute_name: 'Grills', attribute_value: 'No' }] };
  const details = recreationSiteDetails({ campsite: site }, '2', '1');
  assert.deepEqual(details.facts.map(f => f.value), ['No shade', 'RV', 'Not allowed', 'Listed as accessible']);
  assert.deepEqual(recreationSiteDetails({ campsite: { campsite_id: '1', facility_id: '2' } }, '2', '1').facts, []);
});

test('rejects wrong site/facility and inactive inventory; preserves complete active note text safely', () => {
  for (const payload of [{}, { campsite: { ...broadfoot.campsite, facility_id: 'wrong' } },
    { campsite: { ...broadfoot.campsite, campsite_id: 'wrong' } }, { campsite: { ...broadfoot.campsite, is_deactivated: true } }]) {
    assert.throws(() => recreationSiteDetails(payload, '10344948', '10344971'), /Invalid/);
  }
  const details = recreationSiteDetails({ campsite: { ...broadfoot.campsite, notices: [
    { active: true, notice_text: '<script>bad()</script><p>Tents &amp; RVs</p><p>Don&#39;t park here.</p>' },
    { active: false, notice_text: 'Old notice' },
    { active: true, notice_text: '<p>Tents &amp; RVs</p><p>Don&#39;t park here.</p>' },
  ] } }, '10344948', '10344971');
  assert.deepEqual(details.notes, ["Tents & RVs Don't park here."]);
});

test('one bounded daily-cached provider request, with no cached empty answer on failure', async () => {
  const result = await fetchRecreationSiteDetails('10344948', '10344971', async (url, init) => {
    assert.equal(String(url), 'https://www.recreation.gov/api/camps/campsites/10344971');
    assert.ok(init?.signal);
    assert.equal((init as RequestInit & { next: { revalidate: number } }).next.revalidate, 86400);
    return Response.json(broadfoot);
  });
  assert.equal(result.facts.length, 6);
  await assert.rejects(fetchRecreationSiteDetails('../1', '2', async () => { throw new Error('must not fetch'); }), /Invalid/);
  await assert.rejects(fetchRecreationSiteDetails('1', '2', async () => new Response('', { status: 503 })), /unavailable/);
  await assert.rejects(fetchRecreationSiteDetails('1', '2', async () => Response.json({})), /Invalid/);
  assert.equal(navigationCacheTtl('/api/campsites/details?facility=a&site=b'), 3_600_000);
  assert.equal(navigationCacheTtl('/api/campsites?facility=a'), 0);
});

test('details route validates, checks enabled facility/site ownership, limits requests and keeps failures retryable', async () => {
  const original = global.fetch, env = { ...process.env };
  const facility = '11111111-1111-4111-8111-111111111111', site = '22222222-2222-4222-8222-222222222222';
  const query = `facility=${facility}&site=${site}`;
  const request = (q = query, ip = 'site-details-test') => new NextRequest(`https://eddy.guide/api/campsites/details?${q}`, { headers: { 'x-real-ip': ip } });
  let calls = 0, source = 'recreation_gov', missing = '', fail = false, providerCalls = 0;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture';
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    global.fetch = async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.ok(init?.signal);
      if (url.hostname === 'www.recreation.gov') { providerCalls++; return fail ? new Response('', { status: 503 }) : Response.json(broadfoot); }
      if (url.pathname.endsWith('/campsite_facilities')) {
        assert.equal(url.searchParams.get('id'), `eq.${facility}`);
        assert.equal(url.searchParams.get('enabled'), 'eq.true');
        return Response.json(missing === 'facility' ? [] : [{ source, source_facility_id: '10344948' }]);
      }
      assert.equal(url.searchParams.get('facility_id'), `eq.${facility}`);
      assert.equal(url.searchParams.get('id'), `eq.${site}`);
      return Response.json(missing === 'site' ? [] : [{ source_site_id: '10344971' }]);
    };
    assert.equal((await GET(request('facility=bad&site=2'))).status, 400);
    assert.equal(calls, 0);
    const success = await GET(request());
    assert.equal(success.status, 200);
    assert.match(success.headers.get('Cache-Control')!, /s-maxage=3600/);
    const body = await success.json();
    assert.equal(body.siteId, site); assert.equal(body.facilityId, facility); assert.equal(body.details.facts.length, 6);
    for (const key of ['facility', 'site']) { missing = key; assert.equal((await GET(request())).status, 404); }
    assert.equal(providerCalls, 1);
    missing = ''; source = 'mo_state_parks';
    assert.equal((await (await GET(request())).json()).details, null);
    assert.equal(providerCalls, 1);
    source = 'recreation_gov'; fail = true;
    const failed = await GET(request());
    assert.equal(failed.status, 503); assert.equal(failed.headers.get('Cache-Control'), 'no-store');
    for (let i = 0; i < 60; i++) assert.equal((await GET(request('bad=1', 'site-details-rate'))).status, 400);
    assert.equal((await GET(request(query, 'site-details-rate'))).status, 429);
  } finally { global.fetch = original; process.env = env; }
});
