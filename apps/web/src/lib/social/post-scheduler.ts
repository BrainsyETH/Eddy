// src/lib/social/post-scheduler.ts
// Determines what posts to create each cron run based on per-river schedules.
// Each river has a fixed daily posting time (CST). The cron runs every 30 min
// and posts any river whose scheduled time falls within the current window.

import { createAdminClient } from '@/lib/supabase/admin';
import {
  formatDailyDigestCaption,
  formatRiverHighlightCaption,
  formatWeeklyForecastCaption,
  formatSectionGuideCaption,
  formatWeeklyTrendCaption,
} from './content-formatter';
import { pickSectionForRivers } from './section-picker';
import { pickNotableTrend } from './trend-picker';
import { overlayLiveConditions } from './live-conditions';

// Lower = more notable. Mirrors SEVERITY_ORDER in remotion/src/lib/social-props.ts
// (kept separate because the remotion subproject can't import from src/).
const WEEKEND_SEVERITY: Record<string, number> = {
  flowing: 0,
  good: 1,
  high: 2,
  low: 3,
  dangerous: 4,
  too_low: 5,
  unknown: 6,
};
// Rivers worth highlighting on a weekend — "floatable" conditions only.
const WEEKEND_FLOATABLE = new Set(['flowing', 'good', 'high']);
import { getOrCreateConfig } from './config-helpers';
import { getCentralDay, getCentralMinutes } from './central-time';
import type {
  SocialCustomContent,
  SocialPlatform,
  ScheduledPost,
  MediaType,
} from './types';

const LOG_PREFIX = '[SocialScheduler]';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

/**
 * Read the media choice for a given post type + day from social_config.
 * Returns null when the cell is unset / 'off' — the scheduler skips the
 * post entirely in that case (tri-state: off / video / image).
 */
function resolveMedia(
  mediaSchedule: import('./types').MediaSchedule | undefined,
  postType: 'river_highlight' | 'daily_digest',
  dayOfWeek: number,
): MediaType | null {
  const dayKey: DayKey = DAY_KEYS[dayOfWeek] ?? 'sun';
  const choice = mediaSchedule?.[postType]?.[dayKey];
  if (choice === 'video' || choice === 'image') return choice;
  return null;
}

export interface SchedulerResult {
  posts: ScheduledPost[];
  diagnostics: {
    posting_enabled: boolean;
    digest_enabled: boolean;
    rivers: string[];
    eligible_rivers: string[];
    due_rivers: string[];
    skipped_reasons: string[];
    highlight_conditions: string[];
    river_schedules: Record<string, Record<string, string | null>>;
  };
}

export async function getScheduledPosts(options?: { skipTimeCheck?: boolean }): Promise<SchedulerResult> {
  const supabase = createAdminClient();
  const skipTimeCheck = options?.skipTimeCheck ?? false;
  const diag: SchedulerResult['diagnostics'] = {
    posting_enabled: false,
    digest_enabled: false,
    rivers: [],
    eligible_rivers: [],
    due_rivers: [],
    skipped_reasons: [],
    highlight_conditions: [],
    river_schedules: {},
  };

  // Self-healing config loader — handles duplicates, missing rows
  const { data: config, error: configError } = await getOrCreateConfig(supabase);

  if (configError || !config) {
    console.error(`${LOG_PREFIX} Config load error: ${configError}`);
    diag.skipped_reasons.push(`config_error: ${configError}`);
    return { posts: [], diagnostics: diag };
  }

  diag.posting_enabled = config.posting_enabled;
  diag.digest_enabled = config.digest_enabled;
  diag.highlight_conditions = config.highlight_conditions;
  diag.river_schedules = config.river_schedules || {};

  console.log(
    `${LOG_PREFIX} Config: posting_enabled=${config.posting_enabled}, ` +
    `digest_enabled=${config.digest_enabled}, ` +
    `conditions=[${config.highlight_conditions.join(',')}], ` +
    `schedules=${JSON.stringify(config.river_schedules)}` +
    `${skipTimeCheck ? ', skip_time_check=true' : ''}`
  );

  if (!config.posting_enabled) {
    console.log(`${LOG_PREFIX} Posting is disabled`);
    diag.skipped_reasons.push('posting_disabled');
    return { posts: [], diagnostics: diag };
  }

  // Load custom content
  const { data: customContentRows } = await supabase
    .from('social_custom_content')
    .select('*')
    .eq('active', true);

  const customContent = (customContentRows || []) as SocialCustomContent[];

  // Load latest eddy updates (whole-river, non-global, non-expired)
  const { data: eddyUpdates } = await supabase
    .from('eddy_updates')
    .select('id, river_slug, condition_code, gauge_height_ft, quote_text, summary_text, generated_at')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false });

  // Deduplicate: keep only the latest update per river
  const latestByRiver = new Map<string, NonNullable<typeof eddyUpdates>[0]>();
  if (eddyUpdates) {
    for (const update of eddyUpdates) {
      if (!latestByRiver.has(update.river_slug)) {
        latestByRiver.set(update.river_slug, update);
      }
    }
  }
  // Overlay live gauge-derived conditions. eddy_updates.condition_code is
  // captured once per day when the AI generate cron runs; gauge readings
  // refresh hourly. Without this overlay, a river that flipped into 'high'
  // at 2pm would still post as 'flowing' all the way until the next day's
  // 6am regen. This closes that ~25-hour window without touching the
  // eddy_update text (quote/summary still daily — regenerating those needs
  // a fresh Anthropic call and isn't worth the cost).
  const liveUpdates = await overlayLiveConditions(supabase, Array.from(latestByRiver.values()));
  // Rebuild the map so downstream `latestByRiver.get(slug)` lookups see the
  // live-condition-enriched row.
  latestByRiver.clear();
  for (const u of liveUpdates) latestByRiver.set(u.river_slug, u);
  const updates = liveUpdates;
  diag.rivers = updates.map((u) => `${u.river_slug}(${u.condition_code})`);

  if (updates.length === 0) {
    console.log(`${LOG_PREFIX} No fresh per-river eddy updates available`);
    diag.skipped_reasons.push('no_fresh_updates');
  } else {
    console.log(`${LOG_PREFIX} Rivers: ${diag.rivers.join(', ')}`);
  }

  // Load global summary
  const { data: globalUpdate } = await supabase
    .from('eddy_updates')
    .select('quote_text')
    .eq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const globalSummary = globalUpdate?.quote_text || null;

  const posts: ScheduledPost[] = [];
  const baseUrl = 'https://eddy.guide';

  // Pre-compute Central Time day-of-week for video/schedule decisions
  const cstDay = getCentralDay();
  const todayKey = DAY_KEYS[cstDay];

  // --- Weekly Forecast (media_schedule.weekly_forecast drives day/media) ---
  {
    const todayMedia = config.media_schedule?.weekly_forecast?.[todayKey] ?? null;
    if (config.weekly_forecast?.enabled && todayMedia) {
      const { time_utc } = config.weekly_forecast;
      const timeMatches = skipTimeCheck || isNearUtcTime(time_utc, 30);
      const alreadyPosted = await hasPostedToday('weekly_forecast', null, supabase);

      if (!timeMatches) {
        console.log(`${LOG_PREFIX} Weekly forecast: not near ${time_utc} UTC — skipping`);
      } else if (alreadyPosted) {
        console.log(`${LOG_PREFIX} Weekly forecast: already posted today — skipping`);
      } else if (updates.length === 0) {
        console.log(`${LOG_PREFIX} Weekly forecast: no fresh eddy updates — skipping`);
      } else {
        const topRivers = updates
          .filter((u) => WEEKEND_FLOATABLE.has(u.condition_code))
          .sort((a, b) => (WEEKEND_SEVERITY[a.condition_code] ?? 99) - (WEEKEND_SEVERITY[b.condition_code] ?? 99))
          .slice(0, 3);

        if (topRivers.length === 0) {
          console.log(`${LOG_PREFIX} Weekly forecast: no floatable rivers right now — skipping`);
        } else {
          const platforms: SocialPlatform[] = ['facebook', 'instagram'];
          for (const platform of platforms) {
            const { caption, hashtags } = formatWeeklyForecastCaption(topRivers, customContent, platform);
            posts.push({
              postType: 'weekly_forecast',
              platform,
              riverSlug: null,
              caption,
              imageUrl: `${baseUrl}/api/og/social?type=forecast&platform=${platform}`,
              mediaType: todayMedia,
              hashtags,
              eddyUpdateId: null,
            });
          }
        }
      }
    }
  }

  // --- Section Guide (media_schedule.section_guide drives day/media) ---
  {
    const todayMedia = config.media_schedule?.section_guide?.[todayKey] ?? null;
    if (config.section_guide?.enabled && todayMedia) {
      const { time_utc } = config.section_guide;
      const timeMatches = skipTimeCheck || isNearUtcTime(time_utc, 30);
      const alreadyPosted = await hasPostedToday('section_guide', null, supabase);

      if (!timeMatches) {
        console.log(`${LOG_PREFIX} Section guide: not near ${time_utc} UTC — skipping`);
      } else if (alreadyPosted) {
        console.log(`${LOG_PREFIX} Section guide: already posted today — skipping`);
      } else {
        const availableSlugs = updates.map((u) => u.river_slug);
        const section = pickSectionForRivers(availableSlugs);
        if (!section) {
          console.log(`${LOG_PREFIX} Section guide: no rotatable section for available rivers — skipping`);
        } else {
          const platforms: SocialPlatform[] = ['facebook', 'instagram'];
          for (const platform of platforms) {
            const { caption, hashtags } = formatSectionGuideCaption(section, customContent, platform);
            posts.push({
              postType: 'section_guide',
              platform,
              riverSlug: section.riverSlug,
              caption,
              imageUrl: `${baseUrl}/api/og/social?type=section&platform=${platform}`,
              mediaType: todayMedia,
              hashtags,
              eddyUpdateId: null,
            });
          }
        }
      }
    }
  }

  // --- Weekly Trend (media_schedule.weekly_trend drives day/media) ---
  {
    const todayMedia = config.media_schedule?.weekly_trend?.[todayKey] ?? null;
    if (config.weekly_trend?.enabled && todayMedia) {
      const { time_utc } = config.weekly_trend;
      const timeMatches = skipTimeCheck || isNearUtcTime(time_utc, 30);
      const alreadyPosted = await hasPostedToday('weekly_trend', null, supabase);

      if (!timeMatches) {
        console.log(`${LOG_PREFIX} Weekly trend: not near ${time_utc} UTC — skipping`);
      } else if (alreadyPosted) {
        console.log(`${LOG_PREFIX} Weekly trend: already posted today — skipping`);
      } else {
        const availableSlugs = updates.map((u) => u.river_slug);
        const trend = await pickNotableTrend(supabase, { restrictTo: availableSlugs });
        if (!trend) {
          console.log(`${LOG_PREFIX} Weekly trend: no notable movement this week — skipping`);
        } else {
          const latest = updates.find((u) => u.river_slug === trend.riverSlug);
          const platforms: SocialPlatform[] = ['facebook', 'instagram'];
          for (const platform of platforms) {
            const { caption, hashtags } = formatWeeklyTrendCaption(trend, customContent, platform);
            posts.push({
              postType: 'weekly_trend',
              platform,
              riverSlug: trend.riverSlug,
              caption,
              imageUrl: `${baseUrl}/api/og/social?type=trend&platform=${platform}`,
              mediaType: todayMedia,
              hashtags,
              eddyUpdateId: latest?.id ?? null,
            });
          }
        }
      }
    }
  }

  // --- Daily Digest ---
  // Matrix cell is the single source of truth: null cell => skip this day.
  // digest_enabled column is ignored (legacy; kept in schema for back-compat).
  const digestMediaType = resolveMedia(config.media_schedule, 'daily_digest', cstDay);
  if (!digestMediaType) {
    console.log(`${LOG_PREFIX} Daily digest: today's matrix cell is off — skipping`);
  } else {
    const digestAlreadyPosted = await hasPostedToday('daily_digest', null, supabase);
    if (digestAlreadyPosted && !skipTimeCheck) {
      console.log(`${LOG_PREFIX} Daily digest already posted today, skipping`);
    } else if (!isNearDigestTime(config.digest_time_utc) && !skipTimeCheck) {
      console.log(`${LOG_PREFIX} Not near digest time (${config.digest_time_utc} UTC), skipping digest`);
    } else {
      const platforms: SocialPlatform[] = ['facebook', 'instagram'];
      for (const platform of platforms) {
        const { caption, hashtags } = formatDailyDigestCaption(
          updates,
          globalSummary,
          customContent,
          platform
        );

        posts.push({
          postType: 'daily_digest',
          platform,
          riverSlug: null,
          caption,
          imageUrl: `${baseUrl}/api/og/social?type=digest&platform=${platform}`,
          mediaType: digestMediaType,
          hashtags,
          eddyUpdateId: null,
        });
      }
    }
  }

  // --- River Highlights (per-river weekly schedule) ---
  // Matrix cell gates the whole day: null => no highlight posts regardless
  // of any river's individual time. A single click turns off ALL river
  // highlights for that day.
  const highlightMediaType = resolveMedia(config.media_schedule, 'river_highlight', cstDay);
  const schedules = config.river_schedules || {};
  const scheduledRivers = highlightMediaType ? Object.keys(schedules) : [];

  if (!highlightMediaType) {
    console.log(`${LOG_PREFIX} River highlights: today's matrix cell is off — skipping all rivers`);
    diag.skipped_reasons.push('highlight_matrix_off');
  } else if (scheduledRivers.length === 0) {
    console.log(`${LOG_PREFIX} No river schedules configured`);
    diag.skipped_reasons.push('no_river_schedules');
  }

  for (const riverSlug of scheduledRivers) {
    const riverSchedule = schedules[riverSlug];

    // Check if river is disabled
    if (config.disabled_rivers && config.disabled_rivers.includes(riverSlug)) {
      console.log(`${LOG_PREFIX} Skipping ${riverSlug}: disabled`);
      continue;
    }
    if (config.enabled_rivers && config.enabled_rivers.length > 0) {
      if (!config.enabled_rivers.includes(riverSlug)) {
        console.log(`${LOG_PREFIX} Skipping ${riverSlug}: not in enabled_rivers`);
        continue;
      }
    }

    // Get today's scheduled time (null = skip this day)
    const scheduledTime = typeof riverSchedule === 'string'
      ? riverSchedule // backward compat with flat format
      : riverSchedule?.[todayKey];

    if (!scheduledTime) {
      console.log(`${LOG_PREFIX} Skipping ${riverSlug}: no schedule for ${todayKey}`);
      continue;
    }

    // Check if we have a fresh update for this river
    const update = latestByRiver.get(riverSlug);
    if (!update) {
      console.log(`${LOG_PREFIX} Skipping ${riverSlug}: no fresh eddy update`);
      continue;
    }

    // Check condition filter
    if (!config.highlight_conditions.includes(update.condition_code)) {
      console.log(`${LOG_PREFIX} Skipping ${riverSlug}: condition '${update.condition_code}' not in [${config.highlight_conditions.join(',')}]`);
      continue;
    }

    diag.eligible_rivers.push(riverSlug);

    // Check if this river's time window is now (or skip if previewing)
    if (!skipTimeCheck && !isDueNow(scheduledTime)) {
      console.log(`${LOG_PREFIX} Skipping ${riverSlug}: not due yet (scheduled ${scheduledTime} CST on ${todayKey})`);
      continue;
    }

    // Check if already posted today
    if (!skipTimeCheck) {
      const alreadyPosted = await hasPostedToday('river_highlight', riverSlug, supabase);
      if (alreadyPosted) {
        console.log(`${LOG_PREFIX} Skipping ${riverSlug}: already posted today`);
        continue;
      }
    }

    diag.due_rivers.push(riverSlug);

    // Create posts for both platforms
    const platforms: SocialPlatform[] = ['facebook', 'instagram'];
    // highlightMediaType computed above; non-null here (else loop is empty).
    for (const platform of platforms) {
      const { caption, hashtags } = formatRiverHighlightCaption(
        update,
        customContent,
        platform
      );

      posts.push({
        postType: 'river_highlight',
        platform,
        riverSlug: update.river_slug,
        caption,
        imageUrl: `${baseUrl}/api/og/social?type=highlight&river=${update.river_slug}&platform=${platform}`,
        mediaType: highlightMediaType as MediaType,
        hashtags,
        eddyUpdateId: update.id,
      });
    }

    console.log(`${LOG_PREFIX} Scheduling ${riverSlug} (${todayKey} ${scheduledTime} CST)`);
  }

  console.log(`${LOG_PREFIX} Scheduled ${posts.length} posts (${diag.due_rivers.length} river highlights)`);
  return { posts, diagnostics: diag };
}

// Check if a river's scheduled Central Time falls within the current 30-min window
function isDueNow(scheduledTimeCst: string, windowMinutes: number = 30): boolean {
  const nowCstMinutes = getCentralMinutes();

  const [schedH, schedM] = scheduledTimeCst.split(':').map(Number);
  if (isNaN(schedH) || isNaN(schedM)) return false;
  const schedMinutes = schedH * 60 + schedM;

  const diff = nowCstMinutes - schedMinutes;
  // Handle midnight wrap (e.g., scheduled 23:30, now 00:05)
  const adjustedDiff = diff < -720 ? diff + 1440 : diff;
  return adjustedDiff >= 0 && adjustedDiff < windowMinutes;
}

// Check if a post of this type has already been created today
async function hasPostedToday(
  postType: string,
  riverSlug: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let query = supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', postType)
    .gte('created_at', todayStart.toISOString())
    .in('status', ['pending', 'publishing', 'published', 'rendering']);

  if (riverSlug) {
    query = query.eq('river_slug', riverSlug);
  } else {
    query = query.is('river_slug', null);
  }

  const { data } = await query.limit(1);
  if (data && data.length > 0) {
    console.log(`${LOG_PREFIX} hasPostedToday: blocking record found for ${postType}/${riverSlug || 'global'} (id=${data[0].id})`);
    return true;
  }
  return false;
}

// Check if current time is within `windowMinutes` of a configured UTC time.
function isNearUtcTime(timeUtc: string, windowMinutes: number): boolean {
  const [hours, minutes] = timeUtc.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return false;
  const now = new Date();
  const target = new Date();
  target.setUTCHours(hours, minutes, 0, 0);

  const diffMs = Math.abs(now.getTime() - target.getTime());
  return diffMs / (1000 * 60) <= windowMinutes;
}

// Back-compat for existing digest call site.
function isNearDigestTime(digestTimeUtc: string): boolean {
  return isNearUtcTime(digestTimeUtc, 45);
}

// Get failed posts eligible for retry
export async function getRetryablePosts(): Promise<
  Array<{ id: string; post_type: string; platform: string; river_slug: string | null }>
> {
  const supabase = createAdminClient();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('social_posts')
    .select('id, post_type, platform, river_slug, caption, image_url, hashtags, eddy_update_id')
    .eq('status', 'failed')
    .lt('retry_count', 3)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  return data || [];
}
