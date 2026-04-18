// src/lib/social/config-helpers.ts
// Self-healing config loader for social_config singleton table.
// Handles duplicate rows, missing rows, and the happy path.

import type { SocialConfig, VideoFeatures, MediaSchedule, WeeklyReelConfig } from './types';

const LOG_PREFIX = '[SocialConfig]';

export const DEFAULT_VIDEO_FEATURES: VideoFeatures = {
  condition_alerts_as_video: false,
};

export const DEFAULT_WEEKLY_FORECAST: WeeklyReelConfig = {
  enabled: false,
  day_of_week: 5, // Friday
  time_utc: '22:00',
  media: 'video',
};

export const DEFAULT_SECTION_GUIDE: WeeklyReelConfig = {
  enabled: false,
  day_of_week: 3, // Wednesday
  time_utc: '17:00',
  media: 'video',
};

export const DEFAULT_WEEKLY_TREND: WeeklyReelConfig = {
  enabled: false,
  day_of_week: 0, // Sunday
  time_utc: '15:00',
  media: 'video',
};

// Matches the 00092 migration default — Mon/Wed/Fri = video, rest = image.
// Users can edit this matrix from the admin UI; the scheduler reads from
// config, not this constant.
export const DEFAULT_MEDIA_SCHEDULE: MediaSchedule = {
  river_highlight: {
    mon: 'video', tue: 'image', wed: 'video',
    thu: 'image', fri: 'video', sat: 'image', sun: 'image',
  },
  daily_digest: {
    mon: 'video', tue: 'image', wed: 'video',
    thu: 'image', fri: 'video', sat: 'image', sun: 'image',
  },
};

const DEFAULT_CONFIG = {
  posting_enabled: false,
  posting_frequency_hours: 6,
  digest_enabled: false,
  digest_time_utc: '14:00',
  highlights_per_run: 1,
  highlight_cooldown_hours: 12,
  enabled_rivers: null,
  disabled_rivers: [] as string[],
  highlight_conditions: ['flowing', 'dangerous', 'high', 'too_low'],
  weekend_boost_enabled: false,
  video_features: DEFAULT_VIDEO_FEATURES,
  media_schedule: DEFAULT_MEDIA_SCHEDULE,
  weekly_forecast: DEFAULT_WEEKLY_FORECAST,
  section_guide: DEFAULT_SECTION_GUIDE,
  weekly_trend: DEFAULT_WEEKLY_TREND,
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

  // Backfill video_features + media_schedule for rows that predate their
  // respective migrations (or were written before the columns had defaults).
  // Keeps downstream .?. chains clean.
  if (!config.video_features) {
    config.video_features = { ...DEFAULT_VIDEO_FEATURES };
  } else {
    config.video_features = { ...DEFAULT_VIDEO_FEATURES, ...config.video_features };
  }
  if (!config.media_schedule) {
    config.media_schedule = { ...DEFAULT_MEDIA_SCHEDULE };
  } else {
    config.media_schedule = {
      river_highlight: { ...DEFAULT_MEDIA_SCHEDULE.river_highlight, ...(config.media_schedule.river_highlight || {}) },
      daily_digest: { ...DEFAULT_MEDIA_SCHEDULE.daily_digest, ...(config.media_schedule.daily_digest || {}) },
    };
  }
  if (!config.weekly_forecast) {
    config.weekly_forecast = { ...DEFAULT_WEEKLY_FORECAST };
  } else {
    config.weekly_forecast = { ...DEFAULT_WEEKLY_FORECAST, ...config.weekly_forecast };
  }
  if (!config.section_guide) {
    config.section_guide = { ...DEFAULT_SECTION_GUIDE };
  } else {
    config.section_guide = { ...DEFAULT_SECTION_GUIDE, ...config.section_guide };
  }
  if (!config.weekly_trend) {
    config.weekly_trend = { ...DEFAULT_WEEKLY_TREND };
  } else {
    config.weekly_trend = { ...DEFAULT_WEEKLY_TREND, ...config.weekly_trend };
  }

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
