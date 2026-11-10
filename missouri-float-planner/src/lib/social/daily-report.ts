import type { RiverEmbedData } from '../embed/river-data';
import type { DamEmbedData } from '../embed/dam-data';
import { damWidgetSnapshot } from '../../../shared/dam-widget';
import { centralDayKey } from '../../../shared/dam-schedule-copy';

export const DAILY_REPORT_KIND = 'daily-report-carousel' as const;
export const DAILY_REPORT_MAX_SLIDES = 5;
export type DailyReportSlide =
  | { kind: 'river'; data: RiverEmbedData; takeaway: string }
  | { kind: 'dam'; data: DamEmbedData; takeaway: string };
/** Kept in the existing render_request JSON; image_url remains the cover. */
export interface DailyReport {
  kind: typeof DAILY_REPORT_KIND;
  version: 1;
  capturedAt: string;
  slides: DailyReportSlide[];
  imageUrls?: string[];
}

export function isDailyReport(value: unknown): value is DailyReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<DailyReport>;
  return r.kind === DAILY_REPORT_KIND && r.version === 1 && typeof r.capturedAt === 'string'
    && Number.isFinite(Date.parse(r.capturedAt)) && Array.isArray(r.slides)
    && r.slides.length >= 2 && r.slides.length <= DAILY_REPORT_MAX_SLIDES
    && r.slides.every(s => s && (s.kind === 'river' || s.kind === 'dam') && s.data && typeof s.takeaway === 'string');
}

export function dailyReportStamp(at: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short',
    day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at)) + ' CT';
}

export function reportIsCurrent(report: DailyReport, now = Date.now()): boolean {
  const captured = Date.parse(report.capturedAt);
  return now - captured <= 2 * 3_600_000 && captured <= now + 300_000
    && centralDayKey(captured) === centralDayKey(now);
}

/** Stable daily rotation: every river has one slot, independent of its accesses. */
export function rotateReportKeys(keys: string[], at: number): string[] {
  const unique = [...new Set(keys)].sort();
  if (!unique.length) return [];
  const day = Math.floor(Date.parse(centralDayKey(at) + 'T00:00:00Z') / 86_400_000);
  const offset = day % unique.length;
  return [...unique.slice(offset), ...unique.slice(0, offset)];
}

export function riverReportSlide(data: RiverEmbedData, now: number): DailyReportSlide | null {
  const p = data.primary;
  const age = now - Date.parse(p?.readingTimestamp ?? '');
  if (!p || !Number.isFinite(age) || age < -300_000 || age > 3 * 3_600_000
    || p.readingSuspect || data.river.conditionCode === 'unknown' || !data.chart || data.chart.readings.length < 2) return null;
  const readings = data.chart.readings.filter(r => Number.isFinite(r.value) && Date.parse(r.timestamp) <= now);
  const last = readings.at(-1);
  if (!last || now - Date.parse(last.timestamp) > 3 * 3_600_000) return null;
  const previous = [...readings].reverse().find(r => Date.parse(last.timestamp) - Date.parse(r.timestamp) >= 24 * 3_600_000);
  let takeaway = 'The chart shows the past seven days at this gauge. Conditions can differ along the river.';
  if (previous && Date.parse(last.timestamp) - Date.parse(previous.timestamp) <= 27 * 3_600_000) {
    const delta = last.value - previous.value;
    const amount = data.chart.unit === 'cfs' ? Math.round(Math.abs(delta)).toLocaleString('en-US') : Math.abs(delta).toFixed(2);
    const hours = Math.round((Date.parse(last.timestamp) - Date.parse(previous.timestamp)) / 3_600_000);
    takeaway = Number(amount.replaceAll(',', '')) === 0
      ? `Little change at this gauge over the past ${hours} hours. Conditions can differ along the river.`
      : `${delta > 0 ? 'Up' : 'Down'} ${amount} ${data.chart.unit} at this gauge over the past ${hours} hours. Conditions can differ along the river.`;
  }
  // The report has one takeaway; preserve the widget's readings/chart/weather.
  return { kind: 'river', data: { ...data, take: null, secondary: [] }, takeaway };
}

export function damReportSlide(data: DamEmbedData, now: number): DailyReportSlide | null {
  if (!data.powerhouse) return null;
  const packet = damWidgetSnapshot(data.dam, now);
  const moment = packet.entries[0];
  const today = packet.scheduleDays.find(day => day.date === centralDayKey(now));
  if (!moment.scheduleCurrent || !today || !today.hours.some(h => h.megawatts != null)) return null;
  const incomplete = today.hours.some(h => h.megawatts == null);
  const hours = today.hours.filter(h => (h.megawatts ?? 0) > 0 && !h.minimumFlow).length;
  const takeaway = incomplete ? 'Some schedule hours are unavailable. Posted generation and measured turbine flow are separate readings.'
    : hours ? `Generation is posted for ${hours} ${hours === 1 ? 'hour' : 'hours'} today. The schedule can change.`
      : today.hours.some(h => h.minimumFlow) ? 'Only minimum flow is posted today. The schedule can change.'
        : 'No turbine generation is posted today. That does not mean there is no water release.';
  return { kind: 'dam', data, takeaway };
}

export function reportCaption(report: DailyReport): { caption: string; hashtags: string[] } {
  const names = report.slides.map(s => s.kind === 'river' ? s.data.river.name : s.data.dam.name);
  return { caption: `Daily Report · ${dailyReportStamp(report.capturedAt)}\n\n${names.join(' · ')}\n\nSwipe through the charts. These are snapshots; check the latest conditions and schedules at eddy.guide.`, hashtags: [] };
}

/** Complete, immutable JPEG set only. Never publish a partial carousel. */
export function reportImageUrls(value: unknown): string[] | null {
  if (!isDailyReport(value) || !Array.isArray(value.imageUrls) || value.imageUrls.length !== value.slides.length) return null;
  if (new Set(value.imageUrls).size !== value.imageUrls.length) return null;
  return value.imageUrls.every(raw => {
    try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password
      && u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith('/daily-reports/') && /\.jpg$/.test(u.pathname); }
    catch { return false; }
  }) ? value.imageUrls : null;
}

export function reportNeedsRender(post: { render_request?: unknown; media_type: string; video_url?: string | null }): boolean {
  return isDailyReport(post.render_request) ? !reportImageUrls(post.render_request) : post.media_type === 'video' && !post.video_url;
}
