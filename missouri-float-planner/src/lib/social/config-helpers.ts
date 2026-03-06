// src/lib/social/config-helpers.ts
// Self-healing config loader for social_config singleton table.
// Handles duplicate rows, missing rows, and the happy path.

import type { SocialConfig } from './types';

const LOG_PREFIX = '[SocialConfig]';

const DEFAULT_CONFIG = {
  posting_enabled: false,
  posting_frequency_hours: 6,
  digest_enabled: false,
  digest_time_utc: '14:00',
  highlights_per_run: 1,
  highlight_cooldown_hours: 12,
  enabled_rivers: null,
  disabled_rivers: [] as string[],
  highlight_conditions: ['optimal', 'dangerous', 'high', 'too_low'],
};

/**
 * Self-healing config loader:
 * - 0 rows → inserts a default (posting_enabled: false for safety)
 * - 1 row  → returns it
 * - >1 row → keeps newest by updated_at, deletes extras
 */
export async function getOrCreateConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ data: SocialConfig | null; error: string | null }> {
  const { data: rows, error: fetchError } = await supabase
    .from('social_config')
    .select('*')
    .order('updated_at', { ascending: false });

  if (fetchError) {
    console.error(`${LOG_PREFIX} Failed to query social_config: ${fetchError.message}`);
    return { data: null, error: fetchError.message };
  }

  // No rows — insert default
  if (!rows || rows.length === 0) {
    console.log(`${LOG_PREFIX} No config row found — inserting default`);
    const { data: inserted, error: insertError } = await supabase
      .from('social_config')
      .insert(DEFAULT_CONFIG)
      .select('*')
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} Failed to insert default config: ${insertError.message}`);
      return { data: null, error: insertError.message };
    }
    return { data: inserted as SocialConfig, error: null };
  }

  // Happy path: exactly 1 row
  const config = rows[0] as SocialConfig;

  // Multiple rows — self-heal
  if (rows.length > 1) {
    const extraIds = rows.slice(1).map((r: { id: string }) => r.id);
    console.warn(
      `${LOG_PREFIX} SELF-HEALING: Found ${rows.length} config rows. ` +
        `Keeping id=${config.id}, deleting ${extraIds.length} duplicates`
    );
    const { error: deleteError } = await supabase
      .from('social_config')
      .delete()
      .in('id', extraIds);

    if (deleteError) {
      console.error(`${LOG_PREFIX} Failed to delete duplicate configs: ${deleteError.message}`);
    }
  }

  return { data: config, error: null };
}
