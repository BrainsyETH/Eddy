import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/camping/stay/route';
import { GET as getWebSites } from '../../app/api/camping/sites/route';
import { resolveHorizon } from './window';
import { nextCampingDate } from '../../../shared/camping-stay';

test('stay route gates access, validates before reads, caches dates, limits requests and reports failures', async () => {
  const original = global.fetch;
  const env = { ...process.env };
  let reads = 0;
  const arrival = resolveHorizon(new Date(), 90).startDate,
    departure = nextCampingDate(arrival);
  const query = `arrival=${arrival}&departure=${departure}`;
  const request = (q = query, ip = 'camping-route-test') =>
    new NextRequest(`https://eddy.guide/api/camping/stay?${q}`, {
      headers: { 'x-real-ip': ip },
    });
  try {
    process.env.CAMPING_WEB_ENABLED = 'false';
    assert.equal((await GET(request())).status, 404);
    process.env.CAMPING_WEB_ENABLED = 'true';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture';
    global.fetch = async (input, init) => {
      reads++;
      assert.ok(init?.signal, 'all database queries have a deadline');
      const url = new URL(String(input));
      const at = new Date().toISOString();
      const data = url.pathname.endsWith('/campsite_facilities')
        ? [{ id: 'f', source: 'recreation_gov' }]
        : url.pathname.endsWith('/campsite_sites')
          ? Array.from({ length: 40 }, (_, i) => ({
              id: String(i),
              facility_id: 'f',
              site_type: 'STANDARD ELECTRIC',
              name: String(i),
            }))
          : url.pathname.endsWith('/campsite_availability')
            ? [{ facility_id: 'f', date: arrival, fetched_at: at }]
            : Array.from({ length: 5 }, (_, i) => ({
                site_id: String(i),
                date: arrival,
                fetched_at: at,
                status: 'reserved',
                campsite_sites: { facility_id: 'f' },
              }));
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    assert.equal((await GET(request(`${query}&types=Electric`))).status, 400);
    assert.equal(reads, 0);
    const first = await GET(request());
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
    const body = await first.json();
    assert.equal(body.facilities[0].catalogSites, 40);
    assert.equal(
      body.facilities[0].buckets.reduce(
        (n: number, b: { count: number }) => n + b.count,
        0,
      ),
      40,
    );
    const readCount = reads;
    assert.equal((await GET(request())).status, 200);
    assert.equal(reads, readCount, 'date cache shared across requests');
    for (let i = 0; i < 60; i++)
      assert.equal((await GET(request('bad=1', 'rate-test'))).status, 400);
    const limited = await GET(request(query, 'rate-test'));
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.has('Retry-After'));
    assert.equal(reads, readCount);
    global.fetch = async () =>
      new Response(JSON.stringify({ message: 'fixture unavailable' }), {
        status: 503,
      });
    assert.equal(
      (
        await GET(
          request(
            `arrival=${departure}&departure=${nextCampingDate(departure)}`,
          ),
        )
      ).status,
      503,
    );
  } finally {
    global.fetch = original;
    process.env = env;
  }
});

test('web-only details retain unknown catalog sites behind their own flag and limiter', async () => {
  const original = global.fetch;
  const env = { ...process.env };
  const facility = '00000000-0000-4000-8000-000000000001';
  const arrival = resolveHorizon(new Date(), 90).startDate;
  const departure = nextCampingDate(arrival);
  const query = `facility=${facility}&arrival=${arrival}&departure=${departure}`;
  const request = (q = query, ip = 'web-sites-test') => new NextRequest(`https://eddy.guide/api/camping/sites?${q}`, {
    headers: { 'x-real-ip': ip },
  });
  let reads = 0;
  let missing = false;
  const at = new Date().toISOString();
  try {
    process.env.CAMPING_WEB_ENABLED = 'false';
    assert.equal((await getWebSites(request())).status, 404);
    process.env.CAMPING_WEB_ENABLED = 'true';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture';
    global.fetch = async (input, init) => {
      reads++;
      assert.ok(init?.signal);
      const url = new URL(String(input));
      let data: unknown[];
      if (url.pathname.endsWith('/campsite_facilities')) {
        assert.equal(url.searchParams.get('id'), `eq.${facility}`);
        assert.equal(url.searchParams.get('enabled'), 'eq.true');
        data = missing ? [] : [{ id: facility, source: 'recreation_gov' }];
      } else if (url.pathname.endsWith('/campsite_sites')) {
        data = Array.from({ length: 40 }, (_, i) => ({
          id: String(i), facility_id: facility, site_type: 'STANDARD ELECTRIC',
          name: String(i), source_site_id: `provider-${i}`,
        }));
      } else if (url.pathname.endsWith('/campsite_availability')) {
        data = [{ facility_id: facility, date: arrival, fetched_at: at }];
      } else {
        data = Array.from({ length: 5 }, (_, i) => ({
          site_id: String(i), date: arrival, fetched_at: at,
          status: i === 0 ? 'open' : 'reserved', campsite_sites: { facility_id: facility },
        }));
      }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    };
    assert.equal((await getWebSites(request(`${query}&facility=${facility}`))).status, 400);
    assert.equal((await getWebSites(request(`${query}&types=Electric`))).status, 400);
    assert.equal(reads, 0);
    const response = await getWebSites(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const result = await response.json();
    assert.equal(result.summary, null);
    assert.equal(result.sites.length, 40);
    assert.equal(result.sites.filter((s: { state: string }) => s.state === 'unknown').length, 35);
    assert.equal(result.availableSites.length, 1);
    assert.equal(result.availableSites[0].bookingUrl, 'https://www.recreation.gov/camping/campsites/provider-0');
    missing = true;
    assert.equal((await getWebSites(request())).status, 404);
    for (let i = 0; i < 60; i++) assert.equal((await getWebSites(request('invalid=1', 'web-sites-limit'))).status, 400);
    assert.equal((await getWebSites(request(query, 'web-sites-limit'))).status, 429);
    global.fetch = async () => new Response(JSON.stringify({ message: 'fixture failure' }), { status: 503 });
    assert.equal((await getWebSites(request())).status, 503);
  } finally {
    global.fetch = original;
    process.env = env;
  }
});
