// src/lib/social/weekly-review.ts
// Weekly performance analysis and editorial guidance generation.
// Ported from ClawsifiedInfo weekly-review.sh + generate-weekly-bias.sh
//
// Analyzes post engagement, identifies patterns, and generates
// bias guidance for the content decision engine.

import { createAdminClient } from '@/lib/supabase/admin';
import type { ContentMixStatus } from './types';
import { getContentMixStatus } from './content-decision-engine';

const LOG_PREFIX = '[WeeklyReview]';

interface ReviewResults {
  weekStart: string;
  weekEnd: string;
  totalPosts: number;
  contentMix: ContentMixStatus;
  topPerformers: Array<{
    id: string;
    river_slug: string | null;
    content_type: string | null;
    hook_style: string | null;
    engagement_rate: number;
    impressions: number;
    caption: string;
  }>;
  underperformers: Array<{
    id: string;
    river_slug: string | null;
    content_type: string | null;
    engagement_rate: number;
    caption: string;
  }>;
  riverPerformance: Record<string, { posts: number; avgEngagement: number }>;
  hookPerformance: Record<string, { posts: number; avgEngagement: number }>;
  dayPerformance: Record<string, { posts: number; avgEngagement: number }>;
  biasGuidance: string | null;
}

/**
 * Run the weekly review analysis.
 * Typically called Sunday evening via cron.
 */
export async function runWeeklyReview(): Promise<ReviewResults> {
  const supabase = createAdminClient();

  const weekEnd = new Date();
  const weekStart = new Date(Date.now() - 7 * 86400000);

  console.log(`${LOG_PREFIX} Running weekly review: ${weekStart.toISOString().slice(0, 10)} → ${weekEnd.toISOString().slice(0, 10)}`);

  // Fetch this week's published posts with insights
  const { data: posts } = await supabase
    .from('social_posts')
    .select('id, river_slug, content_type, hook_style, audience_segment, caption, engagement_rate, impressions, reach, saves, shares, published_at, platform')
    .gte('published_at', weekStart.toISOString())
    .lte('published_at', weekEnd.toISOString())
    .eq('status', 'published')
    .order('engagement_rate', { ascending: false });

  interface PostRow {
    id: string;
    river_slug: string | null;
    content_type: string | null;
    hook_style: string | null;
    audience_segment: string | null;
    caption: string | null;
    engagement_rate: number | null;
    impressions: number | null;
    reach: number | null;
    saves: number | null;
    shares: number | null;
    published_at: string | null;
    platform: string;
  }

  const allPosts: PostRow[] = (posts || []) as PostRow[];

  // Get content mix status
  const contentMix = await getContentMixStatus(7);

  // Top performers (top 3 by engagement)
  const topPerformers = allPosts
    .filter((p: PostRow) => p.engagement_rate != null)
    .slice(0, 3)
    .map((p: PostRow) => ({
      id: p.id,
      river_slug: p.river_slug,
      content_type: p.content_type,
      hook_style: p.hook_style,
      engagement_rate: p.engagement_rate || 0,
      impressions: p.impressions || 0,
      caption: (p.caption || '').slice(0, 100),
    }));

  // Underperformers (bottom 3)
  const underperformers = allPosts
    .filter((p: PostRow) => p.engagement_rate != null)
    .slice(-3)
    .map((p: PostRow) => ({
      id: p.id,
      river_slug: p.river_slug,
      content_type: p.content_type,
      engagement_rate: p.engagement_rate || 0,
      caption: (p.caption || '').slice(0, 100),
    }));

  // River performance
  const riverPerformance: Record<string, { posts: number; totalEngagement: number; avgEngagement: number }> = {};
  for (const post of allPosts) {
    const river = post.river_slug || 'general';
    if (!riverPerformance[river]) {
      riverPerformance[river] = { posts: 0, totalEngagement: 0, avgEngagement: 0 };
    }
    riverPerformance[river].posts++;
    riverPerformance[river].totalEngagement += post.engagement_rate || 0;
  }
  for (const river in riverPerformance) {
    riverPerformance[river].avgEngagement =
      riverPerformance[river].totalEngagement / riverPerformance[river].posts;
  }

  // Hook style performance
  const hookPerformance: Record<string, { posts: number; totalEngagement: number; avgEngagement: number }> = {};
  for (const post of allPosts) {
    const hook = post.hook_style || 'unknown';
    if (!hookPerformance[hook]) {
      hookPerformance[hook] = { posts: 0, totalEngagement: 0, avgEngagement: 0 };
    }
    hookPerformance[hook].posts++;
    hookPerformance[hook].totalEngagement += post.engagement_rate || 0;
  }
  for (const hook in hookPerformance) {
    hookPerformance[hook].avgEngagement =
      hookPerformance[hook].totalEngagement / hookPerformance[hook].posts;
  }

  // Day of week performance
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayPerformance: Record<string, { posts: number; totalEngagement: number; avgEngagement: number }> = {};
  for (const post of allPosts) {
    const day = dayNames[new Date(post.published_at || '').getDay()];
    if (!dayPerformance[day]) {
      dayPerformance[day] = { posts: 0, totalEngagement: 0, avgEngagement: 0 };
    }
    dayPerformance[day].posts++;
    dayPerformance[day].totalEngagement += post.engagement_rate || 0;
  }
  for (const day in dayPerformance) {
    dayPerformance[day].avgEngagement =
      dayPerformance[day].totalEngagement / dayPerformance[day].posts;
  }

  // Generate bias guidance
  let biasGuidance: string | null = null;
  try {
    biasGuidance = generateBiasGuidance({
      contentMix,
      topPerformers,
      underperformers,
      riverPerformance,
      hookPerformance,
      dayPerformance,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error generating bias guidance:`, error);
  }

  const cleanPerf = <T extends Record<string, { posts: number; avgEngagement: number; totalEngagement?: number }>>(obj: T) => {
    const result: Record<string, { posts: number; avgEngagement: number }> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = { posts: val.posts, avgEngagement: val.avgEngagement };
    }
    return result;
  };

  const review: ReviewResults = {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    totalPosts: allPosts.length,
    contentMix,
    topPerformers,
    underperformers,
    riverPerformance: cleanPerf(riverPerformance),
    hookPerformance: cleanPerf(hookPerformance),
    dayPerformance: cleanPerf(dayPerformance),
    biasGuidance,
  };

  // Save to database
  const { error: insertError } = await supabase
    .from('social_weekly_reviews')
    .upsert({
      week_start: review.weekStart,
      week_end: review.weekEnd,
      review_data: {
        totalPosts: review.totalPosts,
        riverPerformance: review.riverPerformance,
        hookPerformance: review.hookPerformance,
        dayPerformance: review.dayPerformance,
      },
      content_mix: review.contentMix,
      top_performers: review.topPerformers,
      learnings: JSON.stringify({
        underperformers: review.underperformers,
      }),
      bias_guidance: review.biasGuidance,
    }, { onConflict: 'week_start' });

  if (insertError) {
    console.error(`${LOG_PREFIX} Error saving review:`, insertError);
  } else {
    console.log(`${LOG_PREFIX} Weekly review saved for ${review.weekStart}`);
  }

  return review;
}

/**
 * Generate editorial bias guidance from review data.
 * This is a deterministic summary — no API call needed.
 */
function generateBiasGuidance(data: {
  contentMix: ContentMixStatus;
  topPerformers: ReviewResults['topPerformers'];
  underperformers: ReviewResults['underperformers'];
  riverPerformance: Record<string, { posts: number; avgEngagement: number }>;
  hookPerformance: Record<string, { posts: number; avgEngagement: number }>;
  dayPerformance: Record<string, { posts: number; avgEngagement: number }>;
}): string {
  const lines: string[] = [];

  // Content mix adjustments
  const { deviation } = data.contentMix;
  for (const [category, dev] of Object.entries(deviation)) {
    if (Math.abs(dev) > 0.10) {
      lines.push(
        dev > 0
          ? `📈 Post MORE ${category} content (${(dev * 100).toFixed(0)}% under target)`
          : `📉 Post LESS ${category} content (${(-dev * 100).toFixed(0)}% over target)`,
      );
    }
  }

  // Best performing river
  const sortedRivers = Object.entries(data.riverPerformance)
    .filter(([, v]) => v.posts >= 2)
    .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);

  if (sortedRivers.length > 0) {
    lines.push(`🏆 Best river: ${sortedRivers[0][0]} (${(sortedRivers[0][1].avgEngagement * 100).toFixed(1)}% avg engagement)`);
  }

  // Best hook style
  const sortedHooks = Object.entries(data.hookPerformance)
    .filter(([, v]) => v.posts >= 2)
    .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);

  if (sortedHooks.length > 0) {
    lines.push(`🎣 Best hook style: ${sortedHooks[0][0]} (${(sortedHooks[0][1].avgEngagement * 100).toFixed(1)}% avg)`);
  }

  // Best posting day
  const sortedDays = Object.entries(data.dayPerformance)
    .filter(([, v]) => v.posts >= 1)
    .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);

  if (sortedDays.length > 0) {
    lines.push(`📅 Best day: ${sortedDays[0][0]} (${(sortedDays[0][1].avgEngagement * 100).toFixed(1)}% avg)`);
  }

  // Top performer insight
  if (data.topPerformers.length > 0) {
    const top = data.topPerformers[0];
    lines.push(`⭐ Top post: ${top.content_type || 'unknown'} about ${top.river_slug || 'general'} using ${top.hook_style || 'unknown'} hook (${(top.engagement_rate * 100).toFixed(1)}%)`);
  }

  return lines.join('\n');
}
