import { chartStatisticForUnit, chartShareQuery, parseChartShare, type ChartShareState, type ChartLayer, type ChartScaleMode } from './chart-share';
import type { NormalizedGaugeHistory } from './history-normalize';
import { stationDate } from './chart-calendar';

/** Capture only the response that belongs to the current selection. Both UIs use this adapter. */
export function captureChart(input: { siteId: string; provider?: string | null; unit: 'ft' | 'cfs';
  history: Partial<Pick<NormalizedGaugeHistory, 'requestedWindow' | 'timeZone' | 'statistic'>> | null;
  matchesRequest: boolean; comparisonPending: boolean; layers: ChartLayer[]; scale: ChartScaleMode;
  domain: { t0: number; t1: number } | null; riverId?: string }): ChartShareState | null {
  if (input.provider !== 'usgs' || !input.matchesRequest || input.comparisonPending || !input.history?.requestedWindow || !input.domain) return null;
  try {
    const timeZone = input.history.timeZone ?? 'UTC';
    const state: ChartShareState = { version: 1, provider: 'usgs', siteId: input.siteId, unit: input.unit,
      calendar: { from: stationDate(Date.parse(input.history.requestedWindow.from), timeZone), to: stationDate(Date.parse(input.history.requestedWindow.to), timeZone) },
      loaded: { ...input.history.requestedWindow }, visible: { from: new Date(input.domain.t0).toISOString(), to: new Date(input.domain.t1).toISOString() },
      layers: input.unit === 'cfs' ? [...input.layers] : [], scale: input.scale, statistic: chartStatisticForUnit(input.history.statistic, input.unit),
      timeZone: input.history.timeZone ?? 'UTC', ...(input.riverId ? { riverId: input.riverId } : {}) };
    return parseChartShare(state.provider, state.siteId, new URLSearchParams(chartShareQuery(state)));
  } catch { return null; }
}
