// src/lib/social/post-scheduler.ts
// Determines scheduled social posts. Eddy’s Read is one Thursday comparison;
// Float Pick and other format schedules retain their existing behavior.

import { expandDestinations, savedPlacementChoices } from './placements';
import { supportsStory } from './post-types';
import { fallsBackToImage } from './dispatch-videos';
import { MAY_HAVE_PUBLISHED } from './publish-outcome';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  formatWeeklyForecastCaption,
} from './content-formatter';
import { overlayLiveConditions } from './live-conditions';
import { weekendReadDue } from './weekend-read';
import { buildPostContext } from './post-context';
import { dailyReportAutoPublishEnabled } from './daily-report';
import { getEnabledPlatforms } from './adapters';
import { tiktokRemainingBudget } from './tiktok-cap';

import { WEEKEND_FLOATABLE, WEEKEND_SEVERITY } from '@shared/condition-system';
import { getOrCreateConfig } from './config-helpers';
import { getLocalDay, getLocalMinutes, getLocalDateKey } from './local-time';
import { upcomingHolidayWeekend } from './holiday-weekends';
import type {
  SocialCustomContent,
  SocialPlatform,
  ScheduledPost,
  MediaType,
} from './types';

const LOG_PREFIX = '[SocialScheduler]';

// Scheduling zone for the current run — set from social_config.timezone when
// the scheduler loads its config (defaults to Central for legacy configs).
// Times stored in *_time_cst fields are interpreted in this zone.
let schedulerZone = 'America/Chicago';

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
  /** The zone this run read its schedule in; "today" for dedupe means this zone's date. */
  timeZone: string;
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

export async function getScheduledPosts(options?: { skipTimeCheck?: boolean; preview?: boolean }): Promise<SchedulerResult> {
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
    return { posts: [], timeZone: schedulerZone, diagnostics: diag };
  }

  schedulerZone = (config as { timezone?: string }).timezone || 'America/Chicago';

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
    return { posts: [], timeZone: schedulerZone, diagnostics: diag };
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

  const posts: ScheduledPost[] = [];
  // A preview of the full day shows what would post even if something already
  // did; the cron, including a manual skip_time_check run, always dedupes.
  const alreadyPosted = async (postType: string) =>
    !(skipTimeCheck && options?.preview) && await hasPostedToday(postType, supabase);
  const baseUrl = 'https://eddy.guide';

  // Pre-compute scheduling-zone day-of-week for video/schedule decisions
  const cstDay = getLocalDay(schedulerZone);
  const todayKey = DAY_KEYS[cstDay];

  // Platforms this run fans out to (FB/IG when Meta creds present; TikTok only
  // when connected). All scheduled formats are video, so each post also goes to
  // TikTok — but only while the rolling 24h TikTok draft budget lasts. `budget`
  // is decremented per post that includes TikTok; once it hits 0, later posts in
  // this run (and subsequent runs) get FB/IG only.
  const enabledPlatforms = await getEnabledPlatforms(supabase);
  const tiktokEnabled = enabledPlatforms.includes('tiktok');
  const nonTiktokPlatforms = enabledPlatforms.filter((p) => p !== 'tiktok');
  let tiktokBudget = tiktokEnabled ? await tiktokRemainingBudget(supabase) : 0;
  const platformsForPost = (): SocialPlatform[] => {
    if (tiktokEnabled && tiktokBudget > 0) {
      tiktokBudget -= 1;
      return [...nonTiktokPlatforms, 'tiktok'];
    }
    return nonTiktokPlatforms;
  };

  // --- Weekly Forecast (media_schedule.weekly_forecast drives day/media) ---
  {
    const todayMedia = config.media_schedule?.weekly_forecast?.[todayKey] ?? null;
    // Holiday early call: ahead of Memorial Day / July 4th / Labor Day, fire an
    // extra Tuesday forecast even when the grid cell is off — the season's
    // demand-spike weeks get a midweek read plus the regular Friday final call.
    const holidayName = upcomingHolidayWeekend(schedulerZone);
    const holidayEarlyCall = !!holidayName && !todayMedia && todayKey === 'tue';
    // The grid (media_schedule) is the single source of truth for which days a
    // type fires — same as daily_digest/river_highlight. The legacy `enabled`
    // flag isn't maintained by the grid UI, so gating on it silently desynced
    // these posts off even with every day set to Video.
    if ((todayMedia || holidayEarlyCall) && config.weekly_forecast) {
      const { time_cst } = config.weekly_forecast;
      const timeMatches = skipTimeCheck || isDueNow(time_cst);

      if (!timeMatches) {
        console.log(`${LOG_PREFIX} Weekly forecast: not near ${time_cst} CST — skipping`);
      } else if (await alreadyPosted('weekly_forecast')) {
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
          const platforms = platformsForPost();
          for (const platform of platforms) {
            const { caption, hashtags } = formatWeeklyForecastCaption(
              topRivers,
              customContent,
              platform,
              false,
              holidayName ? { name: holidayName, earlyCall: holidayEarlyCall } : null,
            );
            posts.push({
              postType: 'weekly_forecast',
              platform,
              riverSlug: null,
              caption,
              imageUrl: `${baseUrl}/api/og/social?type=forecast&platform=${platform}`,
              mediaType: 'video', // video-only; the matrix cell is just the on/off gate
              hashtags,
              eddyUpdateId: null,
            });
          }
        }
      }
    }
  }

  // --- Float Pick (media_schedule.section_guide drives day/media) ---
  // Delegates the pick + caption + cover to buildPostContext — the single
  // decision point shared with the cron's render-time buildRenderData — so
  // caption, cover, and reel always describe the SAME float. Live-first: a
  // condition-aware 5-9 mi section when any river is flowing/good; otherwise
  // an evergreen favorite from the river-guide blogs (always publishable).
  {
    const todayMedia = config.media_schedule?.section_guide?.[todayKey] ?? null;
    // Grid cell is the gate (see weekly_forecast note above) — not the legacy
    // `enabled` flag, which the grid never sets.
    if (todayMedia && config.section_guide) {
      const { time_cst } = config.section_guide;
      const timeMatches = skipTimeCheck || isDueNow(time_cst);

      if (!timeMatches) {
        console.log(`${LOG_PREFIX} Float Pick: not near ${time_cst} CST — skipping`);
      } else if (await alreadyPosted('section_guide')) {
        console.log(`${LOG_PREFIX} Float Pick: already posted today — skipping`);
      } else {
        const ctx = await buildPostContext(supabase, { postType: 'section_guide' });
        if (!ctx) {
          console.log(`${LOG_PREFIX} Float Pick: no live section and no evergreen favorite — skipping`);
        } else {
          const destinations = expandDestinations(platformsForPost(), savedPlacementChoices(config, 'section_guide'), supportsStory('section_guide'));
          for (const { platform, placement } of destinations) {
            const { caption, hashtags } = ctx.caption(platform, customContent);
            posts.push({
              postType: 'section_guide',
              platform, placement,
              // Render exactly the float this caption describes.
              renderData: ctx.renderData,
              riverSlug: ctx.riverSlug,
              caption,
              imageUrl: ctx.imageUrl(platform),
              mediaType: 'video', // video-only; the matrix cell is just the on/off gate
              hashtags,
              eddyUpdateId: null,
            });
          }
          console.log(
            `${LOG_PREFIX} Scheduling Float Pick for ${ctx.riverSlug}` +
            `${ctx.renderData.evergreen ? ' (evergreen fallback)' : ''}`,
          );
        }
      }
    }
  }

  // Standalone weekly trends are retired; trend context lives in Eddy’s Read.

  // --- Daily Report (legacy daily_digest key) ---
  // After rollout opt-in, the matrix controls days: null cell => skip this day.
  // digest_enabled column is ignored (legacy; kept in schema for back-compat).
  const digestMediaType = resolveMedia(config.media_schedule, 'daily_digest', cstDay);
  if (!dailyReportAutoPublishEnabled()) {
    diag.skipped_reasons.push('daily_report_rollout_paused');
  } else if (!digestMediaType) {
    console.log(`${LOG_PREFIX} Daily digest: today's matrix cell is off — skipping`);
  } else {
    if (await alreadyPosted('daily_digest')) {
      console.log(`${LOG_PREFIX} Daily digest already posted today, skipping`);
    } else if (!isDueNow(config.digest_time_cst) && !skipTimeCheck) {
      console.log(`${LOG_PREFIX} Not near digest time (${config.digest_time_cst} CST), skipping digest`);
    } else {
      // The existing TikTok connector supports video only; do not spend its budget.
      for (const platform of nonTiktokPlatforms) {
        posts.push({ postType: 'daily_digest', platform, riverSlug: null,
          caption: '', imageUrl: '', mediaType: 'image', hashtags: [], eddyUpdateId: null });
      }
    }
  }

  // One Eddy’s Read each Thursday, using the existing format on/off cell.
  // Legacy per-river schedules no longer emit separate social Reads.
  if (weekendReadDue(config.media_schedule?.river_highlight?.thu, new Date(), skipTimeCheck, schedulerZone)) {
    if (!await alreadyPosted('river_highlight')) {
      const ctx = await buildPostContext(supabase, { postType: 'river_highlight', config: { ...config, timezone: schedulerZone } });
      if (ctx) {
        diag.eligible_rivers.push(...(ctx.riverSlugs ?? []));
        diag.due_rivers.push(...(ctx.riverSlugs ?? []));
        for (const platform of platformsForPost()) {
          const { caption, hashtags } = ctx.caption(platform, customContent);
          posts.push({ postType: 'river_highlight', platform, riverSlug: null,
            caption, hashtags, imageUrl: ctx.imageUrl(platform), mediaType: 'video', eddyUpdateId: null });
        }
      } else {
        diag.skipped_reasons.push('weekend_read_needs_two_fresh_rivers');
      }
    }
  } else {
    diag.skipped_reasons.push('weekend_read_not_due_or_disabled');
  }

  console.log(`${LOG_PREFIX} Scheduled ${posts.length} posts (${diag.due_rivers.length} river highlights)`);
  return { posts, timeZone: schedulerZone, diagnostics: diag };
}

// True when the scheduled Central time falls within the current fire window.
// The window (35 min) is intentionally a touch wider than the 30-min cron
// interval, so a time that lands exactly on a cron boundary (e.g. 07:00 →
// 12:00 UTC) still fires off the NEXT tick (diff = 30) when Vercel drops or
// delays the on-time tick. hasPostedToday() dedups, so the wider window can
// never double-post — it only ever catches an otherwise-missed run.
function isDueNow(scheduledTimeCst: string, windowMinutes: number = 35): boolean {
  const nowCstMinutes = getLocalMinutes(schedulerZone);

  const [schedH, schedM] = scheduledTimeCst.split(':').map(Number);
  if (isNaN(schedH) || isNaN(schedM)) return false;
  const schedMinutes = schedH * 60 + schedM;

  const diff = nowCstMinutes - schedMinutes;
  // Handle midnight wrap (e.g., scheduled 23:30, now 00:05)
  const adjustedDiff = diff < -720 ? diff + 1440 : diff;
  return adjustedDiff >= 0 && adjustedDiff < windowMinutes;
}

type TodayRow = { id: string; created_at: string; status: string; auto_publish: boolean; image_url: string | null; platform: string };

/**
 * Posts of a type created on today's date in `timeZone` (Central by default).
 * The scheduler's "today" is the local date, not the UTC date, which rolls
 * over at 6–7pm Central and would let an evening slot fire twice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postsFromToday(supabase: any, postType: string, timeZone: string, now = new Date()): Promise<TodayRow[]> {
  const since = new Date(now.getTime() - 36 * 3600_000);
  const today = getLocalDateKey(timeZone, now);
  const { data, error } = await supabase.from('social_posts')
    .select('id,created_at,status,auto_publish,image_url,platform')
    .eq('post_type', postType).gte('created_at', since.toISOString());
  if (error) throw new Error(`Could not check today's ${postType} posts`);
  let rows = ((data ?? []) as TodayRow[]).filter(row => getLocalDateKey(timeZone, new Date(row.created_at)) === today);
  // ClipEngine also uses river_highlight, including clips without a river.
  // Only a weekend Read counts toward the weekly Read's slot.
  if (postType === 'river_highlight') rows = rows.filter(row => row.image_url?.includes('type=weekend-read&'));
  return rows;
}

/** Whether today's saved row keeps the scheduler from posting this format again. */
export function blocksRepost(postType: string, row: Pick<TodayRow, 'status' | 'auto_publish'>): boolean {
  // `unknown` blocks too: it may have published, and treating it as absent
  // would let the scheduler post the same thing again the same day.
  if ((['pending', 'rendering', ...MAY_HAVE_PUBLISHED] as string[]).includes(row.status)) return true;
  // A scheduled post that cannot fall back to an image waits in History for
  // Render again, even after it fails; the next tick must not queue another.
  return row.auto_publish && !fallsBackToImage(postType);
}

// One post per format per local day, whichever river it features.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasPostedToday(postType: string, supabase: any): Promise<boolean> {
  const blocking = (await postsFromToday(supabase, postType, schedulerZone)).find(row => blocksRepost(postType, row));
  if (blocking) console.log(`${LOG_PREFIX} hasPostedToday: blocking record found for ${postType} (id=${blocking.id})`);
  return !!blocking;
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
    .eq('auto_publish', true)
    .neq('post_type', 'weekly_trend')
    .lt('retry_count', 3)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  return data || [];
}
