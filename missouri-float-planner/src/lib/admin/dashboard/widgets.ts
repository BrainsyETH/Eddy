import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WidgetHistory, WidgetRow } from './widget-model';

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
    if (first.error || first.count === null || first.count > 2000)
      throw new Error('Unavailable or over limit');
    const second =
      first.count > 1000
        ? await query().range(1000, 1999).abortSignal(signal)
        : null;
    if (second?.error) throw new Error('Incomplete history');
    const rows = [
      ...(first.data ?? []),
      ...(second?.data ?? []),
    ] as WidgetRow[];
    if (rows.length !== first.count) throw new Error('Incomplete history');
    return { state: 'ok', through, rows, firstPartyHosts };
  } catch {
    return {
      state: 'unknown',
      through,
      rows: [],
      firstPartyHosts,
      reason:
        'Widget history is unavailable or exceeds the 2,000 daily-counter read limit. No traffic totals are inferred.',
    };
  }
}
