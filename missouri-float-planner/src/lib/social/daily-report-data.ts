import 'server-only';
import { pageRivers } from '@/lib/data/public-pages';
import { loadRiverEmbed } from '@/lib/embed/river-data';
import { loadDamEmbed } from '@/lib/embed/dam-data';
import { DAILY_REPORT_KIND, rotateReportKeys, riverReportSlide, damReportSlide, type DailyReport, type DailyReportSlide } from './daily-report';

const REPORT_DAMS = ['swl-bull-shoals-dam', 'swl-norfork-dam', 'swl-table-rock-dam'];

export async function buildDailyReport(config: { enabled_rivers?: string[] | null; disabled_rivers?: string[] | null }, now = Date.now()): Promise<DailyReport | null> {
  const rivers = await pageRivers();
  const keys = rivers.filter(r => (!config.enabled_rivers || config.enabled_rivers.includes(r.slug))
    && !config.disabled_rivers?.includes(r.slug)).map(r => r.slug);
  const slides: DailyReportSlide[] = [];
  // Small batches bound provider work while allowing stale/missing candidates to be skipped.
  const ordered = rotateReportKeys(keys, now).slice(0, 9);
  for (let i = 0; i < ordered.length && slides.length < 3; i += 3) {
    const candidates = await Promise.allSettled(ordered.slice(i, i + 3).map(slug => loadRiverEmbed(slug, 7)));
    for (const candidate of candidates) {
      if (candidate.status !== 'fulfilled' || !candidate.value || slides.length >= 3) continue;
      const slide = riverReportSlide(candidate.value, now);
      if (slide) slides.push(slide);
    }
  }
  const dams = await Promise.allSettled(rotateReportKeys(REPORT_DAMS, now).map(loadDamEmbed));
  let damCount = 0;
  for (const candidate of dams) {
    if (candidate.status !== 'fulfilled' || !candidate.value || damCount >= 2) continue;
    const slide = damReportSlide(candidate.value, now);
    if (slide) { slides.push(slide); damCount++; }
  }
  if (slides.length < 2) return null;
  return { kind: DAILY_REPORT_KIND, version: 1, capturedAt: new Date(now).toISOString(), slides };
}
