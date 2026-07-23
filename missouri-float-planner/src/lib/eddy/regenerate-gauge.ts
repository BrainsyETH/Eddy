import { createAdminClient } from '@/lib/supabase/admin';
import { generateGaugeUpdate, type SecondaryGaugeTarget } from '@/lib/eddy/generate-gauge-update';
import { usageColumns } from '@/lib/eddy/generate-update';
import {
  canRegenerateGaugeReport,
  GAUGE_REPORT_ROLLING_WINDOW_MS,
} from '@/lib/eddy/gauge-update-policy';

const EVENT_TTL_HOURS = 25;

/** Generate and store one throttled event-driven secondary-gauge report. */
export async function regenerateGaugeUpdate(target: SecondaryGaugeTarget): Promise<number> {
  const supabase = createAdminClient();
  const rollingCutoff = new Date(Date.now() - GAUGE_REPORT_ROLLING_WINDOW_MS).toISOString();
  const { data: recentRows, error: recentError } = await supabase
    .from('gauge_updates')
    .select('generated_at')
    .eq('usgs_site_id', target.usgsSiteId)
    .gte('generated_at', rollingCutoff)
    .order('generated_at', { ascending: false });

  if (recentError) {
    console.error(`[GaugeRegen] Throttle lookup failed for ${target.usgsSiteId}:`, recentError.message);
    return 0;
  }

  if (!canRegenerateGaugeReport({
    latestGeneratedAt: recentRows?.[0]?.generated_at ?? null,
    reportsInRollingWindow: recentRows?.length ?? 0,
  })) {
    console.log(`[GaugeRegen] Skipping ${target.usgsSiteId}: cooldown or rolling limit reached`);
    return 0;
  }

  const update = await generateGaugeUpdate(target);
  if (!update) return 0;

  const expiresAt = new Date(Date.now() + EVENT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('gauge_updates').insert({
    gauge_station_id: update.gaugeStationId,
    usgs_site_id: update.usgsSiteId,
    river_slug: update.riverSlug,
    condition_code: update.conditionCode,
    gauge_height_ft: update.gaugeHeightFt,
    discharge_cfs: update.dischargeCfs,
    quote_text: update.quoteText,
    summary_text: update.summaryText,
    take_sections: update.takeSections,
    sources_used: update.sourcesUsed,
    ...usageColumns(update.usage),
    generated_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error(`[GaugeRegen] Insert failed for ${target.usgsSiteId}:`, insertError.message);
    return 0;
  }

  console.log(`[GaugeRegen] Generated event update for ${target.usgsSiteId} (${update.conditionCode})`);
  return 1;
}
