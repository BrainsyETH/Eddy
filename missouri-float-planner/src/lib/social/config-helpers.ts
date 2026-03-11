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
  weekend_boost_enabled: false,
  river_schedules: {
    'meramec': { mon: '07:00', tue: '07:00', wed: '07:00', thu: '07:00', fri: '07:00', sat: '09:00', sun: '09:00' },
    'current': { mon: '07:30', tue: '07:30', wed: '07:30', thu: '07:30', fri: '07:30', sat: '09:30', sun: '09:30' },
    'eleven-point': { mon: '08:00', tue: '08:00', wed: '08:00', thu: '08:00', fri: '08:00', sat: '10:00', sun: '10:00' },
    'jacks-fork': { mon: '08:30', tue: '08:30', wed: '08:30', thu: '08:30', fri: '08:30', sat: '10:30', sun: '10:30' },
    'niangua': { mon: '09:00', tue: '09:00', wed: '09:00', thu: '09:00', fri: '09:00', sat: '11:00', sun: '11:00' },
    'big-piney': { mon: '09:30', tue: '09:30', wed: '09:30', thu: '09:30', fri: '09:30', sat: '11:30', sun: '11:30' },
    'huzzah': { mon: '10:00', tue: '10:00', wed: '10:00', thu: '10:00', fri: '10:00', sat: '12:00', sun: '12:00' },
    'courtois': { mon: '10:30', tue: '10:30', wed: '10:30', thu: '10:30', fri: '10:30', sat: '12:30', sun: '12:30' },
  } as Record<string, Record<string, string | null>>,
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
