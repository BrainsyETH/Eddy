// src/lib/gauge/last-year-comparison.test.ts
//
// The Last year layer's request and wiring contract on both platforms.
// shared/chart-model.test.ts covers the alignment itself. The hooks and
// renderers are React (and eddy-ios has no runner), so most of this reads
// source, as chart-trend-guard.test.ts does.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lastYearAvailable, priorYearWindow } from '@shared/chart-model';
import { PROVIDER_HISTORY_CAPABILITIES } from '@shared/history-capabilities';
import { selectedWindowDays } from '@/hooks/useLastYearComparison';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const APP_HOOK = read('../eddy-ios/src/hooks/useLastYearHistory.ts');
const APP_CHART = read('../eddy-ios/src/components/GaugeChart.tsx');
const WEB_HOOK = read('src/hooks/useLastYearComparison.ts');
const WEB_CHART = read('src/components/ui/FlowTrendChart.tsx');
const WEB_CALLERS = [
  'src/components/gauge/GaugeDetailView.tsx',
  'src/components/gauge/RiverGaugeDetail.tsx',
  'src/components/gauge/ExpandedGaugeChart.tsx',
].map((path) => [path, read(path)] as const);

test('a one-year view requests the preceding year as whole days', () => {
  assert.deepEqual(
    priorYearWindow({ from: '2024-10-10T17:00:00.000Z', to: '2025-10-09T17:00:00.000Z' }),
    { from: '2023-10-10T00:00:00Z', to: '2024-10-09T23:59:59Z' },
  );
});

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

test('the app hook cancels a superseded request and never caches a failure', () => {
  assert.match(APP_HOOK, /return \(\) => controller\.abort\(\);/, 'a superseded request is no longer aborted');
  assert.match(APP_HOOK, /if \(controller\.signal\.aborted\) return;/, 'a late response can reach state');
  const failed = APP_HOOK.indexOf("status: 'failed'");
  const cached = APP_HOOK.indexOf('cache.current.set(');
  assert.ok(failed !== -1 && cached !== -1 && failed < cached, 'the failure path no longer returns before caching');
  assert.match(APP_HOOK, /'daily'\)/, 'the app no longer asks for daily values');
});

test('the app hook hands out readings only for the window currently asked for', () => {
  assert.match(APP_HOOK, /if \(state\.key !== key\) return \{ status: 'loading', readings: null, retry \};/);
  assert.match(APP_HOOK, /const retry = useCallback\(\(\) => setAttempt/, 'retry no longer re-runs the request');
});

test('the web hook keys on the exact prior window, cancels through the query signal, and retries', () => {
  assert.match(WEB_HOOK, /queryKey: \['gaugeHistory', 'lastYear', siteId, prior\?\.from \?\? null, prior\?\.to \?\? null\]/);
  assert.match(WEB_HOOK, /queryFn: \(\{ signal \}\)/, 'the query no longer receives an abort signal');
  assert.match(WEB_HOOK, /resolution: 'daily'/, 'the web no longer asks for daily values');
  assert.match(WEB_HOOK, /enabled: !!siteId && !!prior/, 'the comparison is fetched while off');
  assert.match(WEB_HOOK, /retry: \(\) => void query\.refetch\(\)/);
  assert.match(read('src/hooks/useGaugeHistory.ts'), /params\.toString\(\)\}`, \{ signal \}\)/, 'fetchHistory drops the signal');
});

test('both renderers align and read out the comparison through the shared model', () => {
  for (const [name, source] of [['app', APP_CHART], ['web', WEB_CHART]] as const) {
    assert.match(source, /alignPriorYear\(/, `${name} chart no longer aligns through the model`);
    assert.match(source, /priorYearPointFor\(/, `${name} readout no longer matches by date`);
    assert.match(source, /Last year · daily average/, `${name} legend lost its label`);
  }
});

test('an ineligible selection turns the layer off', () => {
  for (const [path, source] of WEB_CALLERS) {
    assert.match(source, /if \(lastYearOn && !lastYear\.eligible\) setLastYearOn\(false\);/, `${path} keeps a stale layer on`);
    assert.match(source, /lastYear\.eligible && \(\s*<ChartCompare/, `${path} shows Compare when ineligible`);
  }
  assert.match(APP_CHART, /if \(!lastYearAvailable\(drawnUnit, capabilities, value\)\) setShowLastYear\(false\);/);
  assert.match(APP_CHART, /setShowMedian\(false\); setShowLastYear\(false\);/, 'a unit change keeps the layer on');
});
