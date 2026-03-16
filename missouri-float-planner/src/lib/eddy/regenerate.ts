// src/lib/eddy/regenerate.ts
// Event-driven Eddy report regeneration with throttling.
// Called from the gauge update cron when significant condition changes are detected.

import { createAdminClient } from '@/lib/supabase/admin';
import { getUpdateTargets } from '@/data/river-sections';
import { generateEddyUpdate } from '@/lib/eddy/generate-update';

/** How long to wait before allowing another event-driven regen for the same river */
const COOLDOWN_HOURS = 2;

/** Maximum event-driven regenerations per river per day */
const MAX_DAILY_REGENS = 3;

/** TTL for event-driven updates (shorter than scheduled) */
const EVENT_TTL_HOURS = 3;

export type TriggerReason = 'condition_change' | 'rapid_change';

/**
 * Regenerates Eddy updates for a specific river in response to a significant event.
 * Throttled to prevent runaway costs during sustained volatile periods.
 *
 * @param riverSlug - The river to regenerate updates for
 * @param triggerReason - Why this regeneration was triggered (for logging/monitoring)
 * @returns Number of updates generated, or 0 if throttled/skipped
 */
export async function regenerateEddyForRiver(
  riverSlug: string,
  triggerReason: TriggerReason,
): Promise<number> {
  const supabase = createAdminClient();

  // --- Throttle check: cooldown ---
  // Check if ANY update was generated for this river recently (works with or without migration)
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentUpdates } = await supabase
    .from('eddy_updates')
    .select('id')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gte('generated_at', cooldownCutoff)
    .limit(1);

  if (recentUpdates && recentUpdates.length > 0) {
    console.log(
      `[EddyRegen] Skipping ${riverSlug} (${triggerReason}): update generated within last ${COOLDOWN_HOURS}h`
    );
    return 0;
  }

  // --- Find update targets for this river ---
  const allTargets = getUpdateTargets();
  const riverTargets = allTargets.filter((t) => t.riverSlug === riverSlug);

  if (riverTargets.length === 0) {
    console.warn(`[EddyRegen] No update targets found for river "${riverSlug}"`);
    return 0;
  }

  console.log(
    `[EddyRegen] Regenerating ${riverTargets.length} target(s) for ${riverSlug} (trigger: ${triggerReason})`
  );

  const expiresAt = new Date(Date.now() + EVENT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  let generated = 0;

  for (const target of riverTargets) {
    try {
      const update = await generateEddyUpdate(target);
      if (!update) continue;

      const { error: insertError } = await supabase.from('eddy_updates').insert({
        river_slug: update.riverSlug,
        section_slug: update.sectionSlug,
        condition_code: update.conditionCode,
        gauge_height_ft: update.gaugeHeightFt,
        discharge_cfs: update.dischargeCfs,
        quote_text: update.quoteText,
        summary_text: update.summaryText,
        sources_used: update.sourcesUsed,
        generated_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

      if (insertError) {
        console.error(`[EddyRegen] Insert failed for ${target.riverSlug}/${target.sectionSlug}:`, insertError);
        continue;
      }

      generated++;
      console.log(
        `[EddyRegen] Generated event-driven update for ${target.riverSlug}/${target.sectionSlug || 'whole'}: ` +
          `${update.conditionCode} @ ${update.gaugeHeightFt?.toFixed(1) ?? '?'} ft`
      );
    } catch (e) {
      console.error(`[EddyRegen] Error generating for ${target.riverSlug}/${target.sectionSlug}:`, e);
    }
  }

  return generated;
}
