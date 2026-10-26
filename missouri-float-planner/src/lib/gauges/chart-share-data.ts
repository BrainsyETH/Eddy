import { NextRequest } from 'next/server';
import { gaugeHistoryResponse } from './history-response';
import { gaugeDetailResponse, type GaugeDetailResponse } from './detail-response';
import { normalizeGaugeHistory } from '@shared/history-normalize';
import { priorYearWindow, windowCalendarDates } from '@shared/chart-model';
import { chartView, chartReferences, thresholdsForUnit } from '@shared/chart-view';
import { chartSharePageRiver, type ChartShareState } from '@shared/chart-share';

/** Known missing context cannot be recovered by retrying the same image request. */
export class SharedChartUnavailableError extends Error {
  constructor(public readonly reason: 'station' | 'history' | 'river' | 'calendar') {
    super('This saved chart view is no longer available. Open the gauge for current conditions.');
    this.name = 'SharedChartUnavailableError';
  }
}

/** Reuse public read handlers directly, without a loopback HTTP request or user-selected upstream. */
export async function loadChartShareData(state: ChartShareState, headers: Headers) {
  const context = { params: Promise.resolve({ siteId: state.siteId }) };
  const historyRequest = (
    window: { from: string; to: string },
    resolution: string,
    stationCalendar = true,
  ) =>
    new NextRequest(
      `https://eddy.guide/api/gauges/${state.siteId}/history?${new URLSearchParams({ ...window, resolution, ...(stationCalendar ? { calendar: 'station', tz: state.timeZone } : {}) })}`,
      { headers },
    );
  const [detailResponse, historyResponse] = await Promise.all([
    gaugeDetailResponse(
      new NextRequest(`https://eddy.guide/api/gauges/${state.siteId}`, { headers }),
      context,
    ),
    gaugeHistoryResponse(
      historyRequest(state.loaded, state.statistic === 'instantaneous' ? 'auto' : 'daily'),
      context,
    ),
  ]);
  if (detailResponse.status === 404) throw new SharedChartUnavailableError('station');
  if (historyResponse.status === 404) throw new SharedChartUnavailableError('history');
  if (!detailResponse.ok || !historyResponse.ok) throw new Error('Station history unavailable');
  const { gauge } = (await detailResponse.json()) as GaugeDetailResponse;
  const history = normalizeGaugeHistory(await historyResponse.json());
  if (gauge.provider !== 'usgs') throw new SharedChartUnavailableError('station');
  if (!history?.requestedWindow) throw new Error('Station history unavailable');
  if ((history.timeZone ?? 'UTC') !== state.timeZone)
    throw new SharedChartUnavailableError('calendar');
  const river = state.riverId
    ? chartSharePageRiver(gauge.thresholds, state.riverId, state.riverSlug)
    : null;
  if (state.riverId && !river) throw new SharedChartUnavailableError('river');
  const thresholds = thresholdsForUnit(river, state.unit);
  if (state.riverId && !thresholds) throw new SharedChartUnavailableError('river');
  const dates = windowCalendarDates(state.loaded, state.timeZone);
  let prior = null;
  if (state.layers.includes('lastYear') && dates) {
    const window = priorYearWindow(dates);
    if (window) {
      const response = await gaugeHistoryResponse(historyRequest(window, 'daily', false), context);
      // Do not turn a transient failure into an apparently complete share image.
      if (!response.ok && response.status !== 404) throw new Error('Comparison unavailable');
      prior = response.ok ? normalizeGaugeHistory(await response.json()) : null;
    }
  }
  const view = chartView({
    ...history,
    prior: prior?.readings,
    loaded: state.loaded,
    unit: state.unit,
    timeZone: state.timeZone,
    layers: state.layers,
    scale: state.scale,
    references: chartReferences(state.unit, thresholds, gauge.floodStages),
    visible: { start: Date.parse(state.visible.from), end: Date.parse(state.visible.to) },
  });
  if (!view.domain) throw new SharedChartUnavailableError('history');
  return {
    state,
    gauge,
    history,
    view,
    thresholds: thresholds ?? null,
    generatedAt: new Date().toISOString(),
  };
}
export type ChartShareData = Awaited<ReturnType<typeof loadChartShareData>>;
