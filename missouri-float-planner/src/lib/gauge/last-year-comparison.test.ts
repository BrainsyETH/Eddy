// src/lib/gauge/last-year-comparison.test.ts
//
// The Last year layer's requests and wiring on both platforms.
// shared/chart-model.test.ts covers alignment and the date conventions.
//
// The request rules are exercised for real: the app's loader with promises
// resolved by hand, and the web's query options through a QueryClient and
// QueryObserver against a stubbed fetch. The remaining source checks pin
// wiring that only a renderer could otherwise show.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { lastYearAvailable } from '@shared/chart-model';
import { PROVIDER_HISTORY_CAPABILITIES } from '@shared/history-capabilities';
import { lastYearQueryOptions, selectedWindowDays } from '@/hooks/useLastYearComparison';
import { createLastYearLoader, type LastYearState } from '../../../../eddy-ios/src/lib/lastYearLoader';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** A request whose outcome the test decides, and when. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/* ── Eligibility ───────────────────────────────────────────────────────── */

test('eligibility follows the selected window, preset or custom', () => {
  assert.equal(selectedWindowDays(30), 30);
  assert.equal(selectedWindowDays(30, { from: '2025-09-10T00:00:00Z', to: '2025-10-09T23:59:59Z' }), 30);
  assert.equal(selectedWindowDays(30, { from: '2025-09-11T00:00:00Z', to: '2025-10-09T23:59:59Z' }), 29);
  const { usgs, nws, usace } = PROVIDER_HISTORY_CAPABILITIES;
  for (const days of [1, 7]) assert.equal(lastYearAvailable('cfs', usgs, days), false);
  for (const days of [30, 90, 365]) assert.equal(lastYearAvailable('cfs', usgs, days), true);
  assert.equal(lastYearAvailable('cfs', nws, 30), false);
  assert.equal(lastYearAvailable('cfs', usace, 30), false);
});

/* ── App loader ────────────────────────────────────────────────────────── */

function appLoader() {
  const states: LastYearState<number>[] = [];
  const loader = createLastYearLoader<number>((state) => states.push(state));
  return { loader, states, last: () => states[states.length - 1] };
}

test('app: a response that lands after its window was replaced never reaches the chart', async () => {
  const { loader, last } = appLoader();
  const first = deferred<number[] | null | undefined>();
  const second = deferred<number[] | null | undefined>();
  let firstSignal: AbortSignal | null = null;
  loader.select('A', (signal) => { firstSignal = signal; return first.promise; });
  loader.select('B', () => second.promise);
  assert.equal(firstSignal!.aborted, true, 'the superseded request was not cancelled');

  second.resolve([2]);
  await flush();
  first.resolve([1]);
  await flush();
  assert.deepEqual(last(), { key: 'B', status: 'ready', readings: [2] });
});

test('app: a failure is reported, not cached, and retry asks again', async () => {
  const { loader, last } = appLoader();
  let calls = 0;
  const outcomes: (number[] | undefined)[] = [undefined, [7]];
  loader.select('A', async () => outcomes[calls++]);
  await flush();
  assert.deepEqual(last(), { key: 'A', status: 'failed', readings: null });

  loader.retry();
  assert.equal(last().status, 'loading');
  await flush();
  assert.deepEqual(last(), { key: 'A', status: 'ready', readings: [7] });
  assert.equal(calls, 2);
});

test('app: a thrown request is a failure too', async () => {
  const { loader, last } = appLoader();
  loader.select('A', async () => { throw new Error('offline'); });
  await flush();
  assert.equal(last().status, 'failed');
});

test('app: answers are cached by window, including an empty one', async () => {
  const { loader, last } = appLoader();
  let calls = 0;
  loader.select('A', async () => { calls += 1; return [1]; });
  await flush();
  loader.select('B', async () => { calls += 1; return null; });
  await flush();
  assert.deepEqual(last(), { key: 'B', status: 'empty', readings: null });
  loader.select('A', async () => { calls += 1; return [9]; });
  assert.deepEqual(last(), { key: 'A', status: 'ready', readings: [1] });
  assert.equal(calls, 2);
});

test('app: turning the layer off cancels the request and drops its answer', async () => {
  const { loader, last } = appLoader();
  const pending = deferred<number[] | null | undefined>();
  let signal: AbortSignal | null = null;
  loader.select('A', (s) => { signal = s; return pending.promise; });
  loader.select(null, async () => undefined);
  assert.equal(signal!.aborted, true);
  pending.resolve([1]);
  await flush();
  assert.deepEqual(last(), { key: null, status: 'off', readings: null });
});

/* ── Web query ─────────────────────────────────────────────────────────── */

type FetchCall = { url: string; signal?: AbortSignal; outcome: ReturnType<typeof deferred<Response>> };

function stubFetch() {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const outcome = deferred<Response>();
    calls.push({ url: String(url), signal: init?.signal ?? undefined, outcome });
    return outcome.promise;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ok = (cfs: number) =>
  new Response(JSON.stringify({ readings: [{ timestamp: '2024-10-09', gaugeHeightFt: null, dischargeCfs: cfs }] }));

const priorA = { from: '2023-10-10T00:00:00Z', to: '2024-10-09T23:59:59Z' };
const priorB = { from: '2024-09-10T00:00:00Z', to: '2024-10-09T23:59:59Z' };

test('web: a one-year view requests the preceding year at daily resolution', async () => {
  const fetches = stubFetch();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const observer = new QueryObserver(client, lastYearQueryOptions('07067500', priorA));
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    const url = new URL(fetches.calls[0].url, 'https://eddy.guide');
    assert.equal(url.pathname, '/api/gauges/07067500/history');
    assert.equal(url.searchParams.get('from'), priorA.from);
    assert.equal(url.searchParams.get('to'), priorA.to);
    assert.equal(url.searchParams.get('resolution'), 'daily');
    fetches.calls[0].outcome.resolve(ok(1));
    await flush();
    unsubscribe();
  } finally {
    fetches.restore();
    client.clear();
  }
});

test('web: switching windows cancels the old request and its late answer is not shown', async () => {
  const fetches = stubFetch();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const observer = new QueryObserver(client, lastYearQueryOptions('07067500', priorA));
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    observer.setOptions(lastYearQueryOptions('07067500', priorB));
    await flush();
    assert.equal(fetches.calls.length, 2);
    assert.equal(fetches.calls[0].signal?.aborted, true, 'the superseded request was not cancelled');

    fetches.calls[1].outcome.resolve(ok(222));
    await flush();
    fetches.calls[0].outcome.resolve(ok(111));
    await flush();
    const result = observer.getCurrentResult();
    assert.equal(result.data?.[0].dischargeCfs, 222);
    unsubscribe();
  } finally {
    fetches.restore();
    client.clear();
  }
});

test('web: a failed request reports failure, and retry fetches again', async () => {
  const fetches = stubFetch();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const observer = new QueryObserver(client, lastYearQueryOptions('07067500', priorA));
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    fetches.calls[0].outcome.resolve(new Response('', { status: 500 }));
    await flush();
    assert.equal(observer.getCurrentResult().isError, true);

    const refetch = observer.refetch();
    await flush();
    assert.equal(fetches.calls.length, 2);
    fetches.calls[1].outcome.resolve(ok(5));
    await refetch;
    const result = observer.getCurrentResult();
    assert.equal(result.isError, false);
    assert.equal(result.data?.[0].dischargeCfs, 5);
    unsubscribe();
  } finally {
    fetches.restore();
    client.clear();
  }
});

test('web: nothing is requested while the layer is off', async () => {
  const fetches = stubFetch();
  const client = new QueryClient();
  try {
    const observer = new QueryObserver(client, lastYearQueryOptions('07067500', null));
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    assert.equal(fetches.calls.length, 0);
    unsubscribe();
  } finally {
    fetches.restore();
    client.clear();
  }
});

/* ── Wiring ────────────────────────────────────────────────────────────── */

const APP_CHART = read('../eddy-ios/src/components/GaugeChart.tsx');
const WEB_CHART = read('src/components/ui/FlowTrendChart.tsx');
const PAGES = ['src/components/gauge/GaugeDetailView.tsx', 'src/components/gauge/RiverGaugeDetail.tsx']
  .map((path) => [path, read(path)] as const);
const EXPANDED = read('src/components/gauge/ExpandedGaugeChart.tsx');

test('both renderers align and read out the comparison through the shared model', () => {
  for (const [name, source] of [['app', APP_CHART], ['web', WEB_CHART]] as const) {
    assert.match(source, /alignPriorYear\(/, `${name} chart no longer aligns through the model`);
    assert.match(source, /priorYearPointFor\(/, `${name} readout no longer matches by date`);
    assert.match(source, /Last year · daily average/, `${name} legend lost its label`);
  }
});

test('each web page shares one Last year setting with its expanded chart', () => {
  for (const [path, source] of PAGES) {
    assert.match(source, /lastYearOn=\{lastYearOn\}/, `${path} does not hand its setting to the expanded chart`);
    assert.match(source, /onLastYearChange=\{setLastYearOn\}/, `${path} does not take changes back from it`);
    assert.match(source, /if \(unit !== 'cfs'\) setLastYearFor\(null\);/, `${path} keeps the layer on for stage`);
    assert.match(source, /if \(!lastYearAvailable\(effectiveUnit, lastYearCapabilities, days\)\) setLastYearFor\(null\);/);
  }
  assert.doesNotMatch(EXPANDED, /useState\([^)]*\)[^\n]*lastYear/i, 'the expanded chart grew its own setting again');
  assert.match(EXPANDED, /onChange=\{onLastYearChange\}/);
  assert.match(EXPANDED, /dates: range\.kind === 'custom' \? \{ from: range\.from, to: range\.to \} : null/,
    'the expanded chart re-derives picked dates from UTC instants');
});

test('the app turns the layer off for an unsupported range or measurement', () => {
  assert.match(APP_CHART, /if \(!lastYearAvailable\(drawnUnit, capabilities, value\)\) setShowLastYear\(false\);/);
  assert.match(APP_CHART, /setShowMedian\(false\); setShowLastYear\(false\);/, 'a unit change keeps the layer on');
});
