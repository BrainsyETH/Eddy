import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WidgetHistory, WidgetRow } from './widget-model';

/** One row per (widget, river, site, day). Refuse rather than chart a partial month. */
const MAX_ROWS = 5000;

export async function widgetHistory(now: number): Promise<WidgetHistory> {
  const through = new Date(now).toISOString().slice(0, 10);
  const firstPartyHosts = ['eddy.guide', 'www.eddy.guide'];
  for (const value of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    if (!value) continue;
    try {
      firstPartyHosts.push(
        new URL(
          value.startsWith('http') ? value : `https://${value}`,
        ).hostname.toLowerCase(),
      );
    } catch {
      /* Invalid optional configuration does not establish attribution. */
    }
  }
  try {
    const db = createAdminClient();
    const signal = AbortSignal.timeout(4000);
    const since = new Date(Date.parse(through) - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
    const query = () =>
      db
        .from('embed_impressions')
        .select('day,widget_type,widget_key,referrer_host,count', {
          count: 'exact',
        })
        .gte('day', since)
        .lte('day', through)
        .order('id');
    const first = await query().range(0, 999).abortSignal(signal);
    if (first.error || first.count === null || first.count > MAX_ROWS)
      throw new Error('Unavailable or over limit');
    const total = first.count;
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, Math.ceil(total / 1000) - 1) }, (_, i) =>
        query()
          .range((i + 1) * 1000, (i + 2) * 1000 - 1)
          .abortSignal(signal),
      ),
    );
    if (rest.some((r) => r.error)) throw new Error('Incomplete history');
    const rows = [first, ...rest].flatMap(
      (r) => (r.data ?? []) as WidgetRow[],
    );
    if (rows.length !== total) throw new Error('Incomplete history');
    return { state: 'ok', through, rows, firstPartyHosts };
  } catch {
    return {
      state: 'unknown',
      through,
      rows: [],
      firstPartyHosts,
      reason:
        'Widget history could not be loaded right now.',
    };
  }
}
