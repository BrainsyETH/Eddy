// Synthetic capacity check: real loader/cache, paged fixture responses, no network.
// This measures processing and a chosen per-page delay, never deployment latency.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { readRegionalStay, regionalStay } from '../src/lib/camping/web-data';
import { filteredStay, type RegionalStay } from '../src/lib/camping/web-search';
import { resolveHorizon } from '../src/lib/camping/window';
import { nextCampingDate } from '../shared/camping-stay';

async function main() {
  const pageMs = Number(process.env.CAMPING_FIXTURE_PAGE_MS ?? 0);
  assert.ok(Number.isFinite(pageMs) && pageMs >= 0 && pageMs <= 1000, 'page delay must be 0–1000ms');
  const at = new Date().toISOString();
  const arrival = resolveHorizon(new Date(), 90).startDate;
  const nights = [arrival];
  while (nights.length < 14) nights.push(nextCampingDate(nights.at(-1)!));
  const departure = nextCampingDate(nights.at(-1)!);
  const facilities = Array.from({ length: 200 }, (_, i) => ({
    id: `facility-${String(i).padStart(3, '0')}`, source: 'recreation_gov',
    source_facility_id: String(i), source_loop: null,
  }));
  const types = ['TENT ONLY', 'RV ELECTRIC', 'STANDARD NONELECTRIC', null];
  const sites = Array.from({ length: 5000 }, (_, i) => ({
    id: `site-${String(i).padStart(4, '0')}`, facility_id: facilities[Math.floor(i / 25)].id,
    name: String(i), site_type: types[i % types.length],
  }));
  const observations = facilities.flatMap((facility) => nights.map((date) => ({
    facility_id: facility.id, date, fetched_at: at,
  })));
  const statuses = ['open', 'reserved', 'closed', 'not_yet_released', 'walk_up', 'unrecognized'];
  const siteNights = sites.flatMap((site, i) => nights.map((date) => ({
    site_id: site.id, date, fetched_at: at, status: statuses[i % statuses.length],
    campsite_sites: { facility_id: site.facility_id },
  })));
  const tables: Record<string, unknown[]> = {
    campsite_facilities: facilities, campsite_sites: sites,
    campsite_availability: observations, campsite_site_availability: siteNights,
  };
  const reads: Record<string, number> = {};
  const originalFetch = global.fetch;
  const env = { ...process.env };
  const samples = 100, concurrency = 5;
  let result: RegionalStay;
  const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  async function measure(load: () => Promise<RegionalStay>) {
    const times: number[] = [];
    for (let i = 0; i < samples; i += concurrency) {
      const batch = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
        const start = performance.now();
        result = await load();
        times.push(performance.now() - start);
      }));
      for (const attempt of batch) {
        if (attempt.status === 'rejected') throw attempt.reason;
      }
    }
    return p95(times);
  }
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://capacity-fixture.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture';
    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://capacity-fixture.invalid', 'fixture must never reach a real service');
      const table = url.pathname.split('/').at(-1)!;
      assert.ok(table in tables, `unexpected table: ${table}`);
      reads[table] = (reads[table] ?? 0) + 1;
      init?.signal?.throwIfAborted();
      if (pageMs) await delay(pageMs, undefined, { signal: init?.signal ?? undefined });
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 900);
      return new Response(JSON.stringify(tables[table].slice(offset, offset + limit)), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const coldP95 = await measure(() => readRegionalStay(arrival, departure));
    assert.deepEqual(reads, {
      campsite_facilities: samples, campsite_availability: samples * 4,
      campsite_sites: samples * 6, campsite_site_availability: samples * 78,
    });
    assert.equal(result!.facilities.length, 200);
    assert.equal(result!.facilities.reduce((sum, f) => sum + f.catalogSites, 0), 5000);
    assert.ok(result!.facilities.some((f) => f.buckets.some((b) => b.state === 'available')));
    assert.equal(result!.facilities.flatMap((f) => f.buckets).reduce((sum, b) => sum + b.count, 0), 5000);
    await regionalStay(arrival, departure);
    const beforeWarm = JSON.stringify(reads);
    const warmP95 = await measure(() => regionalStay(arrival, departure));
    assert.equal(JSON.stringify(reads), beforeWarm, 'warm reads must hit the date cache');
    const compressedBytes = gzipSync(JSON.stringify(result!)).byteLength;
    assert.ok(compressedBytes <= 200 * 1024, 'regional response exceeds size budget');
    const filterTimes = Array.from({ length: samples }, () => {
      const start = performance.now();
      result!.facilities.map((f) => filteredStay([f], ['Electric']));
      return performance.now() - start;
    });
    console.log(JSON.stringify({
      evidence: 'synthetic fixture; not deployment latency', samples, concurrency, pageMs,
      facilities: 200, sites: 5000, nights: 14, siteNightRows: 70000,
      databaseCallsPerColdRead: 89, siteNightPagesPerColdRead: 78,
      coldP95Ms: Math.round(coldP95), warmP95Ms: Math.round(warmP95),
      filteringP95Ms: Math.round(p95(filterTimes)), compressedBytes,
    }, null, 2));
  } finally {
    global.fetch = originalFetch;
    process.env = env;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
