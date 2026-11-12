import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as nextServer from 'next/server';
import * as share from '@shared/dam-schedule-share';
import * as indexing from './dam-schedule-indexing';
import { damSchedulePageResponse } from './dam-schedule-page-response';
import { damScheduleShare, damScheduleImagePath, shareableScheduleDates, validScheduleDate } from '@shared/dam-schedule-share';
import { damWidgetSnapshot } from '@shared/dam-widget';
import { renderDamSchedule } from './og/render-dam-schedule';
import { scheduleShareFixture, scheduleShareNow as now } from './__fixtures__/dam-schedule-share';

test('dated images retain the widget capacity, MW, intervals, and summaries', () => {
  const dam = scheduleShareFixture();
  const image = damScheduleShare(dam, '2026-11-12', now)!;
  assert.deepEqual(image.day, damWidgetSnapshot(dam, now).scheduleDays[0]);
  assert.equal(image.day.hours[7].label, '7 AM');
  assert.equal(image.day.hours[7].fraction, 0.5);
  assert.equal(image.dateLabel, 'November 12, 2026');
  assert.match(image.checked, /Nov 12, 2026.*8:20 AM CST/);
  assert.equal(image.warning, null);
});

test('images never substitute today for an unavailable or malformed date', () => {
  for (const date of ['2026-11-11', '2026-11-14', '2026-02-30', 'today', '../../admin', '2026-11-12T00:00Z'])
    assert.equal(damScheduleShare(scheduleShareFixture(), date, now), null, date);
  assert.equal(validScheduleDate('2028-02-29'), true);
  assert.equal(validScheduleDate('2026-02-29'), false);
  assert.equal(damScheduleImagePath('swt-fort-gibson-dam', '2026-11-12'), '/dams/swt-fort-gibson-dam/schedule/2026-11-12/image.png');
});

test('missing and duplicate hours stay gaps; minimum flow is never a generation bar', () => {
  const dam = scheduleShareFixture();
  dam.schedule[0].hours.splice(0, 1);
  dam.schedule[0].hours.push({ ...dam.schedule[0].hours[0] });
  dam.schedule[0].hours[2] = { ...dam.schedule[0].hours[2], minimumFlow: true, megawatts: 3 };
  const image = damScheduleShare(dam, '2026-11-12', now)!;
  assert.equal(image.day.hours[0].megawatts, null);
  assert.equal(image.day.hours[1].megawatts, null);
  assert.equal(image.missing, 2);
  assert.equal(image.day.hours[3].minimumFlow, true);
  assert.equal(image.minimumFlow, true);
});

test('missing capacity remains unscaled and true zero differs from unavailable data', () => {
  const dam = scheduleShareFixture();
  delete dam.generationReference;
  assert.equal(damScheduleShare(dam, '2026-11-12', now)!.day.hours[7].fraction, null);
  dam.schedule[0].hours.forEach(hour => { hour.megawatts = 0; });
  const zero = damScheduleShare(dam, '2026-11-12', now)!;
  assert.equal(zero.summary, 'No generation scheduled');
  dam.schedule[0].hours = [];
  assert.equal(damScheduleShare(dam, '2026-11-12', now), null);
});

test('unknown or future check times make no freshness claim, and stale checks are visible', () => {
  for (const retrievedAt of [null, 'invalid', '2026-11-13T14:20:00Z']) {
    const dam = scheduleShareFixture();
    dam.schedule[0].retrievedAt = retrievedAt;
    const model = damScheduleShare(dam, '2026-11-12', now)!;
    assert.equal(model.checked, 'Schedule check time unavailable');
    assert.ok(model.warning);
  }
  const dam = scheduleShareFixture();
  dam.schedule[0].retrievedAt = '2026-11-12T12:00:00Z';
  assert.match(damScheduleShare(dam, '2026-11-12', now)!.warning!, /may have changed/);
});

test('calendar date and check time survive midnight and Central daylight saving changes', () => {
  const dam = scheduleShareFixture();
  dam.schedule[0].scheduleDate = '2026-11-01';
  dam.schedule[0].retrievedAt = '2026-11-01T06:20:00Z';
  assert.match(damScheduleShare(dam, '2026-11-01', Date.parse('2026-11-01T06:30:00Z'))!.checked, /1:20 AM CDT/);
  dam.schedule[0].retrievedAt = '2026-11-01T07:20:00Z';
  assert.match(damScheduleShare(dam, '2026-11-01', Date.parse('2026-11-01T07:30:00Z'))!.checked, /1:20 AM CST/);
  assert.equal(damScheduleShare(dam, '2026-11-01', Date.parse('2026-11-02T05:59:00Z'))!.dateLabel, 'November 1, 2026');
});

test('date choices are ordered and exclude ambiguous or unavailable schedules', () => {
  const dam = scheduleShareFixture();
  assert.deepEqual(shareableScheduleDates([...dam.schedule].reverse()), ['2026-11-12', '2026-11-13']);
  dam.schedule.push(dam.schedule[0], { ...dam.schedule[0], scheduleDate: 'bad' }, { ...dam.schedule[0], scheduleDate: '2026-11-14', hours: [] });
  assert.deepEqual(shareableScheduleDates(dam.schedule), ['2026-11-13']);
});

test('the real image renderer produces a PNG with local Eddy assets and embedded fonts', async () => {
  const image = Buffer.from(await renderDamSchedule(damScheduleShare(scheduleShareFixture(), '2026-11-12', now)!));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 800);
});

test('public image route preserves the exact date, canonical URL and uncached failures', async () => {
  // Execute the real route with only its upstream I/O replaced. No provider,
  // Redis or production requests are involved in this contract check.
  const model = damScheduleShare(scheduleShareFixture(), '2026-11-12', now)!;
  const loads: string[] = [];
  let mode: 'ok' | 'absent' | 'failed' | 'limited' = 'ok';
  const dependencies: Record<string, unknown> = {
    'next/server': nextServer,
    '@shared/dam-schedule-share': share,
    '@/lib/dam-schedule-indexing': { ...indexing, damScheduleExpired: (date: string) => indexing.damScheduleExpired(date, now) },
    '@/lib/flow-providers/usace-registry': { getUsaceDam: (id: string) => id === model.damId ? { swpaCode: 'FGD' } : null },
    '@/lib/dam-schedule-share': { loadDamScheduleShare: async (id: string, date: string) => {
      assert.equal(id, model.damId);
      loads.push(date);
      return mode === 'absent' ? null : model;
    } },
    '@/lib/og/render-dam-schedule': { renderDamSchedule: async () => {
      if (mode === 'failed') throw new Error('Render failed');
      return new Uint8Array([137, 80, 78, 71]);
    } },
    '@/lib/rate-limit': { getClientIp: () => 'fixture', rateLimit: async () => mode === 'limited' ? new Response('Limited', { status: 429 }) : null },
  };
  type Get = (request: nextServer.NextRequest, context: { params: Promise<{ damId: string; date: string }> }) => Promise<Response>;
  const exports: { GET?: Get } = {};
  const source = readFileSync('src/app/dams/[damId]/schedule/[date]/image.png/route.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Response, URL, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected route dependency: ${name}`);
    return dependencies[name];
  } });
  assert.ok(exports.GET);
  const request = (date = model.date, query = '', damId = model.damId) => exports.GET!(
    new nextServer.NextRequest(`https://eddy.guide${share.damScheduleImagePath(damId, date)}${query}`),
    { params: Promise.resolve({ damId, date }) },
  );
  assert.equal((await request('invalid')).status, 404);
  assert.equal((await request(model.date, '', 'unknown')).status, 404);
  const expired = await request('2026-11-11');
  assert.equal(expired.status, 410);
  assert.equal(expired.headers.get('X-Robots-Tag'), 'noindex');
  const redirect = await request(model.date, '?download=1');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), `https://eddy.guide${model.imagePath}`);
  assert.deepEqual(loads, [], 'rejected and noncanonical requests do not fetch a snapshot');
  const image = await request();
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal(image.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(image.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=300');
  assert.match(image.headers.get('Content-Disposition')!, /2026-11-12-schedule\.png/);
  assert.equal(loads[0], model.date);
  for (const [state, status] of [['absent', 503], ['failed', 503], ['limited', 429]] as const) {
    mode = state;
    const failure = await request();
    assert.equal(failure.status, status);
    assert.equal(failure.headers.get('Cache-Control'), 'no-store');
    assert.equal(failure.headers.get('X-Robots-Tag'), 'noindex');
    assert.notEqual(failure.headers.get('Content-Type'), 'image/png');
  }
});

test('expired pages return 410 before streaming, with a live-dam link and no upstream lookup', async () => {
  const request = (path: string) => new nextServer.NextRequest(`https://eddy.guide${path}`);
  const path = '/dams/swt-fort-gibson-dam/schedule/2026-11-11';
  const response = damSchedulePageResponse(request(path), now)!;
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const html = await response.text();
  assert.match(html, /This schedule has expired/);
  assert.match(html, /href="\/dams\/swt-fort-gibson-dam#generation"/);
  assert.match(html, /noindex, follow/);
  assert.equal(damSchedulePageResponse(request('/dams/unknown/schedule/2026-11-11'), now)!.status, 404);
  assert.equal(damSchedulePageResponse(request('/dams/swt-fort-gibson-dam/schedule/2026-02-30'), now)!.status, 404);
  for (const unchanged of ['/dams', '/dams/swt-fort-gibson-dam', '/dams/swt-fort-gibson-dam/opengraph-image/preview',
    '/dams/swt-fort-gibson-dam/schedule/2026-11-12', '/dams/swt-fort-gibson-dam/schedule/2026-11-13', '/rivers', '/sitemap.xml'])
    assert.equal(damSchedulePageResponse(request(unchanged), now), null, unchanged);
  // Central midnight, including the fall DST transition; UTC midnight is not expiry.
  assert.equal(indexing.damScheduleExpired('2026-11-01', Date.parse('2026-11-02T05:59:59Z')), false);
  assert.equal(indexing.damScheduleExpired('2026-11-01', Date.parse('2026-11-02T06:00:00Z')), true);
});

test('dated page metadata always excludes search while preserving successful share previews', async () => {
  const model = damScheduleShare(scheduleShareFixture(), '2026-11-12', now)!;
  let available = true;
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': {}, 'next/link': {}, 'next/server': {}, 'next/navigation': {}, 'lucide-react': {},
    '@shared/dam-schedule-share': share,
    '@/lib/flow-providers/usace-registry': { getUsaceDam: () => ({ name: model.name, swpaCode: 'FGD' }) },
    '@/lib/dam-schedule-share': { loadDamScheduleShare: async () => available ? model : null },
    '@/lib/dam-schedule-indexing': indexing,
    '@/lib/json-ld': {}, '@/lib/dam-page-copy': { SITE_URL: 'https://eddy.guide' },
    '@/components/dam/DamScheduleShareButton': {},
  };
  const exports: { generateMetadata?: (props: { params: Promise<{ damId: string; date: string }> }) => Promise<import('next').Metadata> } = {};
  const source = readFileSync('src/app/dams/[damId]/schedule/[date]/page.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected page dependency: ${name}`);
    return dependencies[name];
  } });
  const props = { params: Promise.resolve({ damId: model.damId, date: model.date }) };
  const metadata = await exports.generateMetadata!(props);
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.equal(metadata.alternates, undefined, 'utility pages do not nominate a competing canonical');
  assert.equal(metadata.openGraph?.url, `https://eddy.guide${model.pagePath}`);
  assert.match(JSON.stringify(metadata.openGraph?.images), /2026-11-12\/image.png/);
  assert.match(JSON.stringify(metadata.twitter?.images), /2026-11-12\/image.png/);
  available = false;
  const unavailable = await exports.generateMetadata!(props);
  assert.deepEqual(unavailable.robots, { index: false, follow: true });
  assert.equal(JSON.stringify(unavailable.openGraph?.images), '[]');
});
