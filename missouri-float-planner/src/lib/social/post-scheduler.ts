// src/lib/social/post-scheduler.ts
// Determines what posts to create each cron run based on config and recent updates

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

export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  const supabase = createAdminClient();

  // Self-healing config loader — handles duplicates, missing rows
  const { data: config, error: configError } = await getOrCreateConfig(supabase);

  if (configError || !config) {
    console.error(`${LOG_PREFIX} Config load error: ${configError}`);
    return [];
  }

  console.log(`${LOG_PREFIX} Config: posting_enabled=${config.posting_enabled}, highlights_per_run=${config.highlights_per_run}, conditions=[${config.highlight_conditions.join(',')}], cooldown=${config.highlight_cooldown_hours}h`);

  if (!config.posting_enabled) {
    console.log(`${LOG_PREFIX} Posting is disabled`);
    return [];
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

  if (!eddyUpdates || eddyUpdates.length === 0) {
    console.log(`${LOG_PREFIX} No fresh eddy updates available`);
    return [];
  }

  // Deduplicate: keep only the latest update per river
  const latestByRiver = new Map<string, typeof eddyUpdates[0]>();
  for (const update of eddyUpdates) {
    if (!latestByRiver.has(update.river_slug)) {
      latestByRiver.set(update.river_slug, update);
    }
  }
  const updates = Array.from(latestByRiver.values());
  console.log(`${LOG_PREFIX} Rivers: ${updates.map(u => `${u.river_slug}(${u.condition_code})`).join(', ')}`);

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
  // Hardcode production domain — env var approach was fragile (NEXT_PUBLIC_SITE_URL
  // was set to eddyfloat.com which doesn't resolve, causing all image fetches to fail)
  const baseUrl = 'https://eddy.guide';

  // --- Daily Digest ---
  if (config.digest_enabled) {
    const digestAlreadyPosted = await hasPostedToday('daily_digest', null, supabase);
    if (!digestAlreadyPosted) {
      // Check if current time is near the configured digest time
      if (isNearDigestTime(config.digest_time_utc)) {
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
  }

  // --- River Highlights ---
  // Filter rivers based on config
  const eligibleUpdates = updates.filter((u) => {
    if (config.enabled_rivers && config.enabled_rivers.length > 0) {
      if (!config.enabled_rivers.includes(u.river_slug)) {
        console.log(`${LOG_PREFIX} Skipping ${u.river_slug}: not in enabled_rivers`);
        return false;
      }
    }
    if (config.disabled_rivers && config.disabled_rivers.includes(u.river_slug)) {
      console.log(`${LOG_PREFIX} Skipping ${u.river_slug}: in disabled_rivers`);
      return false;
    }
    if (!config.highlight_conditions.includes(u.condition_code)) {
      console.log(`${LOG_PREFIX} Skipping ${u.river_slug}: condition '${u.condition_code}' not in [${config.highlight_conditions.join(',')}]`);
      return false;
    }
    return true;
  });
  console.log(`${LOG_PREFIX} ${eligibleUpdates.length}/${updates.length} rivers eligible after filtering`);

  let highlightCount = 0;
  for (const update of eligibleUpdates) {
    if (highlightCount >= config.highlights_per_run) break;

    // Check cooldown
    const recentlyPosted = await hasPostedRecently(
      'river_highlight',
      update.river_slug,
      config.highlight_cooldown_hours,
      supabase
    );
    if (recentlyPosted) {
      console.log(`${LOG_PREFIX} Skipping ${update.river_slug}: in ${config.highlight_cooldown_hours}h cooldown`);
      continue;
    }

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

    highlightCount++;
  }

  console.log(`${LOG_PREFIX} Scheduled ${posts.length} posts (${highlightCount} river highlights)`);
  return posts;
}

// Check if a daily digest has already been posted today
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

// Check if a river highlight was posted within the cooldown window
async function hasPostedRecently(
  postType: string,
  riverSlug: string,
  cooldownHours: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', postType)
    .eq('river_slug', riverSlug)
    .gte('created_at', cutoff)
    .in('status', ['pending', 'publishing', 'published'])
    .limit(1);

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
