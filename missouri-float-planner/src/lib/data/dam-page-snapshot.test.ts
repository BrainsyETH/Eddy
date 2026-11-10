import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import type { DamScheduleDay } from '@shared/dam-types';
import DamDetail from '../../components/dam/DamDetail';
import { USACE_DAMS } from '../flow-providers/usace-registry';
import { buildSnapshot, refreshStaleness, type DamSnapshot } from './dams';
import { isFresh, MAX_AGE_MS } from './dam-snapshot-store';
import { loadDamPageSnapshot, type DamPageSnapshotSources } from './dam-page-snapshot';

const DAM = USACE_DAMS['swl-table-rock-dam'];
const HOUR = 60 * 60 * 1000;
// 2026-11-07 23:30 CST, half an hour before the Central midnight the bug crossed.
const BUILT_AT = Date.parse('2026-11-08T05:30:00Z');
const availability = { title: 'Schedule currently unavailable', detail: 'Test detail.' };

const scheduleDay = (scheduleDate: string, megawatts: number): DamScheduleDay => ({
  scheduleDate, retrievedAt: '2026-11-07T21:35:00Z', idle: [],
  hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts, cfs: null, isRamp: false })),
});

/** What the hourly cron stored at BUILT_AT: Sat, Sun and Mon posted, readings fresh then. */
function storedSnapshot(): DamSnapshot {
  const at = new Date(BUILT_AT - 30 * 60 * 1000).toISOString();
  return buildSnapshot(DAM, {
    release: { value: 5300, unit: 'cfs', at, staleness: 'fresh' },
    poolElevation: { value: 910.25, unit: 'ft', at, staleness: 'fresh' },
  }, [scheduleDay('2026-11-07', 81), scheduleDay('2026-11-08', 0), scheduleDay('2026-11-09', 120)]);
}

function sources(stored: DamSnapshot | null, live: DamSnapshot | null = null) {
  const calls = { stored: [] as unknown[][], live: [] as string[] };
  const fake: DamPageSnapshotSources = {
    readStored: async (...args) => { calls.stored.push(args); return stored; },
    readLive: async (damId) => { calls.live.push(damId); return live; },
  };
  return { fake, calls };
}

/** The server HTML the page sends, before any client clock runs. */
function renderPage(dam: DamSnapshot, renderedAt: number): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const noop = () => {};
  const router: AppRouterInstance = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, bfcacheId: 'test' };
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(ImageConfigContext.Provider, { value: imageConfigDefault },
        createElement(AppRouterContext.Provider, { value: router },
          createElement(DamDetail, { dam, renderedAt, availability })))));
  } finally { client.clear(); }
}

const todayHeading = (html: string) => html.match(/Today’s generation schedule <span[^>]*>· ([^<]+)/)?.[1];

test('regression: a render after Central midnight labels the reader’s day as Today, not the day the data was built', async () => {
  // The original bug: HTML rendered on Sat, Nov 7 was still being served on
  // Sun, Nov 8 and said "Today’s generation · Sat, Nov 7".
  const now = BUILT_AT + HOUR; // 2026-11-08 00:30 CST, the stored row an hour old.
  const { fake, calls } = sources(storedSnapshot());
  const dam = await loadDamPageSnapshot(DAM.id, now, fake);
  assert.ok(dam);
  assert.deepEqual(calls.stored, [[DAM.id, { now }]], 'the stored row is judged against the request clock');
  assert.deepEqual(calls.live, [], 'a usable stored row avoids the live read');

  const html = renderPage(dam, now);
  assert.equal(todayHeading(html), 'Sun, Nov 8');
  assert.doesNotMatch(html, /Today’s generation schedule <span[^>]*>· Sat, Nov 7/);
  assert.match(html, /Tomorrow’s generation schedule <span[^>]*>· Mon, Nov 9/);
});

test('stored readings are re-banded against the request clock instead of keeping the cron’s staleness', async () => {
  const stored = storedSnapshot();
  const now = BUILT_AT + 2.5 * HOUR; // Still a usable row; its readings are now three hours old.
  assert.ok(isFresh(new Date(BUILT_AT).toISOString(), now));
  const { fake } = sources(stored);
  const dam = await loadDamPageSnapshot(DAM.id, now, fake);
  assert.deepEqual(dam, refreshStaleness(stored, now));
  assert.notEqual(dam?.metrics.release?.staleness, 'fresh');
});

test('a missing or too-old stored row falls back to a live read, never to an old render', async () => {
  // readStoredSnapshot returns null both for no row and for a row past
  // MAX_AGE_MS (isFresh). The page then reads live rather than serving it.
  assert.equal(isFresh(new Date(BUILT_AT).toISOString(), BUILT_AT + MAX_AGE_MS), false);
  const now = Date.parse('2026-11-08T18:00:00Z'); // Sun, Nov 8, noon CST.
  const live = buildSnapshot(DAM, {}, [scheduleDay('2026-11-08', 200), scheduleDay('2026-11-09', 0)]);
  const { fake, calls } = sources(null, live);
  const dam = await loadDamPageSnapshot(DAM.id, now, fake);
  assert.deepEqual(calls.live, [DAM.id]);
  assert.equal(dam, live);
  assert.equal(todayHeading(renderPage(dam!, now)), 'Sun, Nov 8');
});

test('with no stored row and a failed live read, the page says unavailable instead of showing old data', async () => {
  const now = Date.parse('2026-11-08T18:00:00Z');
  // fetchDamDetail never throws; a total outage is an empty, well-formed snapshot.
  const { fake } = sources(null, buildSnapshot(DAM, {}, []));
  const html = renderPage((await loadDamPageSnapshot(DAM.id, now, fake))!, now);
  assert.match(html, /Schedule currently unavailable/);
  assert.doesNotMatch(html, /Today’s generation schedule <span/);
  assert.doesNotMatch(html, /Nov 7/);
});

test('a schedule that holds only yesterday is not presented as today', async () => {
  const now = Date.parse('2026-11-08T18:00:00Z');
  const { fake } = sources(null, buildSnapshot(DAM, {}, [scheduleDay('2026-11-07', 81)]));
  const html = renderPage((await loadDamPageSnapshot(DAM.id, now, fake))!, now);
  assert.equal(todayHeading(html), 'Sun, Nov 8');
  assert.match(html, /Today’s generation schedule is unavailable/);
});

test('an id the registry does not carry reads nothing', async () => {
  const { fake, calls } = sources(storedSnapshot(), storedSnapshot());
  assert.equal(await loadDamPageSnapshot('decommissioned-dam', BUILT_AT, fake), null);
  assert.deepEqual(calls, { stored: [], live: [] });
});

// A modest guard on the one rule that caused the bug; the behaviour itself is
// checked by the render tests above and by an HTTP smoke test before merge.
// ISR and unstable_cache (pageDam) both hand their last entry, however old, to
// the next visitor: that is how Saturday's HTML reached Sunday's readers.
test('the dam detail route renders per request and is not served from an ISR or unstable_cache entry', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/dams/[damId]/page.tsx'), 'utf8');
  assert.doesNotMatch(source, /export const revalidate|export function generateStaticParams|unstable_cache|\bpageDam\b/);
  assert.match(source, /await connection\(\)/);
});
