import { stationDate } from './chart-calendar';
/** Public, versioned view specification. Contains no readings or paid content. */
export type ChartScaleMode = 'loaded' | 'visible' | 'full';
export type ChartLayer = 'typical' | 'median' | 'lastYear';
export type ChartStatistic = 'instantaneous' | 'daily_mean' | 'daily_selected';
export interface ShareStation { provider: 'usgs' | 'usace'; siteId: string }
export interface ChartShareState {
  version: 1;
  provider: 'usgs';
  siteId: string;
  unit: 'ft' | 'cfs';
  loaded: { from: string; to: string };
  visible: { from: string; to: string };
  calendar: { from: string; to: string };
  layers: ChartLayer[];
  scale: ChartScaleMode;
  statistic: ChartStatistic;
  timeZone: string;
  /** The curated river whose thresholds were displayed; absent means no ladder. */
  riverId?: string;
}
export const SHARE_MAX_DAYS = 366;
export const SHARE_MAX_LENGTH = 2048;
const DAY = 86_400_000;
const LAYERS: ChartLayer[] = ['typical', 'median', 'lastYear'];

export function shareStation(provider: string, siteId: string): ShareStation | null {
  if (provider === 'usgs' && /^\d{8,15}$/.test(siteId)) return { provider, siteId };
  if (provider === 'usace' && /^[a-z0-9][a-z0-9-]{1,79}$/.test(siteId)) return { provider, siteId };
  return null;
}
export function gaugeSharePath(station: ShareStation): string {
  return `/share/gauge/${station.provider}/${encodeURIComponent(station.siteId)}`;
}
export function validTimeZone(zone: string): boolean {
  if (!zone || zone.length > 80) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0); return true; } catch { return false; }
}
function instant(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const iso = new Date(time).toISOString();
  return iso.slice(0, 19) === value.slice(0, 19) ? iso : null;
}
export function parseChartShare(provider: string, siteId: string, params: URLSearchParams): ChartShareState | null {
  if (params.toString().length > SHARE_MAX_LENGTH || provider !== 'usgs' || !shareStation(provider, siteId)) return null;
  const keys = ['v', 'unit', 'from', 'to', 'start', 'end', 'layers', 'scale', 'stat', 'tz', 'river', 'cfrom', 'cto'];
  if (keys.some(key => params.getAll(key).length > 1) || params.get('v') !== '1') return null;
  const unit = params.get('unit');
  const from = instant(params.get('from')); const to = instant(params.get('to'));
  const start = instant(params.get('start')); const end = instant(params.get('end'));
  const scale = params.get('scale'); const statistic = params.get('stat'); const timeZone = params.get('tz') ?? '';
  const rawLayers = params.get('layers');
  const layers = rawLayers ? rawLayers.split(',') : [];
  const riverId = params.get('river') ?? undefined;
  if (!from || !to || !start || !end || !['ft', 'cfs'].includes(unit ?? '') || !validTimeZone(timeZone)
    || !['loaded', 'visible', 'full'].includes(scale ?? '')
    || !['instantaneous', 'daily_mean', 'daily_selected'].includes(statistic ?? '')
    || rawLayers === null || layers.some(layer => !LAYERS.includes(layer as ChartLayer))
    || new Set(layers).size !== layers.length || (unit === 'ft' && layers.length)
    || (riverId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(riverId))) return null;
  const calendar = { from: params.get('cfrom') ?? '', to: params.get('cto') ?? '' };
  if (calendar.from !== stationDate(Date.parse(from), timeZone) || calendar.to !== stationDate(Date.parse(to), timeZone)) return null;
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > SHARE_MAX_DAYS * DAY + 3_600_000 || Date.parse(start) >= Date.parse(end)
    || Date.parse(start) < Date.parse(from) - DAY || Date.parse(end) > Date.parse(to) + 14 * DAY
    || (layers.includes('lastYear') && Math.round(span / DAY) < 30)) return null;
  return { version: 1, provider, siteId, unit: unit as 'ft' | 'cfs', loaded: { from, to }, visible: { from: start, to: end },
    calendar, layers: LAYERS.filter(layer => layers.includes(layer)), scale: scale as ChartScaleMode,
    statistic: statistic as ChartStatistic, timeZone, ...(riverId ? { riverId } : {}) };
}
export function chartShareQuery(state: ChartShareState): string {
  if (state.version !== 1) throw new Error('Unsupported chart version.');
  const p = new URLSearchParams({ v: '1', unit: state.unit, from: state.loaded.from, to: state.loaded.to,
    start: state.visible.from, end: state.visible.to, layers: LAYERS.filter(l => state.layers.includes(l)).join(','),
    cfrom: state.calendar.from, cto: state.calendar.to, scale: state.scale, stat: state.statistic, tz: state.timeZone });
  if (state.riverId) p.set('river', state.riverId);
  if (!parseChartShare(state.provider, state.siteId, p)) throw new Error('This chart view cannot be shared yet.');
  return p.toString();
}
export function chartSharePath(state: ChartShareState): string {
  return `/share/chart/usgs/${state.siteId}?${chartShareQuery(state)}`;
}
export function chartImagePath(state: ChartShareState): string {
  return `/api/share/chart/usgs/${state.siteId}/image?${chartShareQuery(state)}`;
}
export function chartStatisticLabel(statistic: ChartStatistic): string {
  return statistic === 'daily_mean' ? 'Daily averages' : statistic === 'daily_selected' ? 'Daily observations' : 'Instantaneous observations';
}
export function resolutionNotice(original: ChartStatistic, served: ChartStatistic): string | null {
  return original === served ? null : `Showing ${chartStatisticLabel(served).toLowerCase()}.`;
}
export function shareParams(values: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, part);
  return params;
}

/** USGS stage dailies are selected observations, even when the response also has flow means. */
export function chartStatisticForUnit(statistic: ChartStatistic | undefined, unit: 'ft' | 'cfs'): ChartStatistic {
  return statistic && statistic !== 'instantaneous' && unit === 'ft' ? 'daily_selected' : statistic ?? 'instantaneous';
}
