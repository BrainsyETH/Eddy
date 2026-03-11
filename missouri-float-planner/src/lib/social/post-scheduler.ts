// src/lib/social/post-scheduler.ts
// Determines what posts to create each cron run based on per-river schedules.
// Each river has a fixed daily posting time (CST). The cron runs every 30 min
// and posts any river whose scheduled time falls within the current window.

import { createAdminClient } from '@/lib/supabase/admin';
import {
  formatDailyDigestCaption,
  formatRiverHighlightCaption,
} from './content-formatter';
import { getOrCreateConfig } from './config-helpers';
import type {
  SocialCustomContent,
  SocialPlatform,
  ScheduledPost,
} from './types';

const LOG_PREFIX = '[SocialScheduler]';

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
  const updates = Array.from(latestByRiver.values());
  diag.rivers = updates.map(u => `${u.river_slug}(${u.condition_code})`);

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

  // --- Daily Digest ---
  // Digest can work with just the global summary, so don't require per-river updates
  if (!config.digest_enabled) {
    console.log(`${LOG_PREFIX} Digest disabled in config`);
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
          hashtags,
          eddyUpdateId: null,
        });
      }
    }
  }

  // --- River Highlights (per-river weekly schedule) ---
  const schedules = config.river_schedules || {};
  const scheduledRivers = Object.keys(schedules);
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const now = new Date();
  const CST_OFFSET = -6;
  const cstDay = new Date(now.getTime() + CST_OFFSET * 3600000).getUTCDay();
  const todayKey = DAY_KEYS[cstDay];

  if (scheduledRivers.length === 0) {
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
        hashtags,
        eddyUpdateId: update.id,
      });
    }

    console.log(`${LOG_PREFIX} Scheduling ${riverSlug} (${todayKey} ${scheduledTime} CST)`);
  }

  console.log(`${LOG_PREFIX} Scheduled ${posts.length} posts (${diag.due_rivers.length} river highlights)`);
  return { posts, diagnostics: diag };
}

// Check if a river's scheduled CST time falls within the current 30-min window
function isDueNow(scheduledTimeCst: string, windowMinutes: number = 30): boolean {
  const now = new Date();
  // CST = UTC-6 (fixed offset; close enough for social posting)
  const CST_OFFSET = -6;
  const nowCstMinutes = ((now.getUTCHours() + 24 + CST_OFFSET) % 24) * 60 + now.getUTCMinutes();

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
    .in('status', ['pending', 'publishing', 'published']);

  if (riverSlug) {
    query = query.eq('river_slug', riverSlug);
  } else {
    query = query.is('river_slug', null);
  }

  const { data } = await query.limit(1);
  return (data && data.length > 0) || false;
}

// Check if current time is within 45 minutes of the configured digest time
function isNearDigestTime(digestTimeUtc: string): boolean {
  const [hours, minutes] = digestTimeUtc.split(':').map(Number);
  const now = new Date();
  const digestTime = new Date();
  digestTime.setUTCHours(hours, minutes, 0, 0);

  const diffMs = Math.abs(now.getTime() - digestTime.getTime());
  const diffMinutes = diffMs / (1000 * 60);

  return diffMinutes <= 45;
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
