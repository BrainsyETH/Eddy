// src/lib/social/content-decision-engine.ts
// AI-powered content decision engine for social media posting.
// Ported from ClawsifiedInfo decide-and-post.sh + decide-format.sh
//
// Analyzes posting history, clip library, and engagement data to recommend
// what to post next — content type, format, river, and clip selection.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ContentCategory,
  ContentDecision,
  ContentFormat,
  ContentMixStatus,
  AudienceSegment,
  HookStyle,
  ClipLibraryItem,
} from './types';

const LOG_PREFIX = '[ContentDecision]';

// Target content mix ratios (from ClipEngine decide-and-post.sh)
const TARGET_MIX: Record<ContentCategory, number> = {
  conditions: 0.30,
  educational: 0.40,
  engagement: 0.20,
  promotional: 0.10,
};

// River freshness: minimum days between posts about the same river
const RIVER_COOLDOWN_DAYS = 3;

// Format selection: minimum days between montages/highlights
const MONTAGE_COOLDOWN_DAYS = 4;
const HIGHLIGHTS_COOLDOWN_DAYS = 3;

// Max montages per week
const MAX_MONTAGES_PER_WEEK = 2;
const MAX_HIGHLIGHTS_PER_WEEK = 2;

/**
 * Analyze current content mix vs targets.
 */
export async function getContentMixStatus(lookbackDays = 14): Promise<ContentMixStatus> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  const { data: posts } = await supabase
    .from('social_posts')
    .select('content_type')
    .gte('created_at', since)
    .eq('status', 'published');

  const counts: Record<ContentCategory, number> = {
    conditions: 0,
    educational: 0,
    engagement: 0,
    promotional: 0,
  };

  const total = posts?.length || 0;
  for (const post of posts || []) {
    const ct = post.content_type as ContentCategory;
    if (ct && ct in counts) counts[ct]++;
  }

  const actual: Record<ContentCategory, number> = {
    conditions: total > 0 ? counts.conditions / total : 0,
    educational: total > 0 ? counts.educational / total : 0,
    engagement: total > 0 ? counts.engagement / total : 0,
    promotional: total > 0 ? counts.promotional / total : 0,
  };

  const deviation: Record<ContentCategory, number> = {
    conditions: TARGET_MIX.conditions - actual.conditions,
    educational: TARGET_MIX.educational - actual.educational,
    engagement: TARGET_MIX.engagement - actual.engagement,
    promotional: TARGET_MIX.promotional - actual.promotional,
  };

  return { actual, target: TARGET_MIX, deviation };
}

/**
 * Get rivers that haven't been posted about recently (stale rivers).
 */
export async function getRiverFreshness(): Promise<Array<{ slug: string; daysSince: number }>> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  // Get all rivers
  const { data: rivers } = await supabase
    .from('rivers')
    .select('slug');

  // Get recent posts by river
  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('river_slug, created_at')
    .gte('created_at', since)
    .eq('status', 'published')
    .not('river_slug', 'is', null)
    .order('created_at', { ascending: false });

  const lastPosted: Record<string, string> = {};
  for (const post of recentPosts || []) {
    if (post.river_slug && !lastPosted[post.river_slug]) {
      lastPosted[post.river_slug] = post.created_at;
    }
  }

  const now = Date.now();
  return (rivers || [])
    .map((r: { slug: string }) => {
      const last = lastPosted[r.slug];
      const daysSince = last
        ? (now - new Date(last).getTime()) / 86400000
        : 999;
      return { slug: r.slug, daysSince: Math.floor(daysSince) };
    })
    .sort((a: { daysSince: number }, b: { daysSince: number }) => b.daysSince - a.daysSince);
}

/**
 * Select the best content format based on recent history and clip library.
 * Ported from decide-format.sh decision tree.
 */
export async function selectFormat(): Promise<{
  format: ContentFormat;
  theme: string | null;
  river: string | null;
  title: string | null;
  reasoning: string;
}> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat

  // Get recent post formats
  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('post_type, river_slug, published_at')
    .gte('published_at', since)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(14);

  const posts = recentPosts || [];

  // Count formats
  const formatCounts = {
    single: posts.filter((p: { post_type: string }) => p.post_type === 'river_highlight' || p.post_type === 'manual').length,
    highlights: posts.filter((p: { post_type: string }) => p.post_type === 'daily_digest').length,
    montage: 0, // Will count below
  };

  // Days since last montage/highlights
  let daysSinceMontage = 999;
  let daysSinceHighlights = 999;

  for (const post of posts) {
    const daysAgo = (Date.now() - new Date(post.published_at || '').getTime()) / 86400000;
    if (post.post_type === 'daily_digest' && daysAgo < daysSinceHighlights) {
      daysSinceHighlights = daysAgo;
    }
  }

  // Check clip library for themes
  const { data: clips } = await supabase
    .from('clip_library')
    .select('*')
    .gte('created_at', weekAgo)
    .eq('brand_check_status', 'approved');

  const weekClips = clips || [];

  // Count clips per river
  const riverCounts: Record<string, number> = {};
  for (const clip of weekClips) {
    if (clip.river_slug) {
      riverCounts[clip.river_slug] = (riverCounts[clip.river_slug] || 0) + 1;
    }
  }

  const bestRiver = Object.entries(riverCounts).sort((a, b) => b[1] - a[1])[0];

  // Check last 3 posts for streak
  const last3Types = posts.slice(0, 3).map((p: { post_type: string }) => p.post_type);
  const isStreaking = last3Types.length === 3 && new Set(last3Types).size === 1;

  console.log(`${LOG_PREFIX} Format inputs: singles=${formatCounts.single} daysSinceMontage=${daysSinceMontage} daysSinceHighlights=${daysSinceHighlights}`);
  console.log(`${LOG_PREFIX} Week clips: ${weekClips.length}, bestRiver: ${bestRiver?.[0]}(${bestRiver?.[1]})`);

  // Decision tree (ported from decide-format.sh)

  // a. Sunday/Monday best-of-week montage
  if ((dayOfWeek === 0 || dayOfWeek === 1) && weekClips.length >= 3 && daysSinceMontage >= MONTAGE_COOLDOWN_DAYS) {
    return {
      format: 'montage',
      theme: 'best-of-week',
      river: null,
      title: 'Best of This Week',
      reasoning: 'Sunday/Monday trigger with 3+ weekly clips',
    };
  }

  // b. River spotlight — one river has 4+ clips
  if (bestRiver && bestRiver[1] >= 4 && daysSinceMontage >= 3) {
    return {
      format: 'montage',
      theme: 'river-spotlight',
      river: bestRiver[0],
      title: null, // Generated by caption-generator
      reasoning: `River spotlight: ${bestRiver[0]} has ${bestRiver[1]} clips`,
    };
  }

  // c. Break a single-clip streak
  if (isStreaking && last3Types[0] === 'river_highlight') {
    return {
      format: 'highlights',
      theme: null,
      river: null,
      title: null,
      reasoning: 'Breaking single-clip streak with highlights',
    };
  }

  // d. Highlights if it's been a while
  if (daysSinceHighlights >= HIGHLIGHTS_COOLDOWN_DAYS) {
    return {
      format: 'highlights',
      theme: null,
      river: null,
      title: null,
      reasoning: `Highlights due (${Math.floor(daysSinceHighlights)} days since last)`,
    };
  }

  // e. Default: single clip
  return {
    format: 'single',
    theme: null,
    river: null,
    title: null,
    reasoning: 'Default single clip',
  };
}

/**
 * Main decision function: what should we post next?
 * Combines content mix targeting, format selection, river freshness, and clip availability.
 */
export async function decideNextPost(): Promise<ContentDecision> {
  const supabase = createAdminClient();

  // Run analyses in parallel
  const [mixStatus, freshness, formatDecision] = await Promise.all([
    getContentMixStatus(),
    getRiverFreshness(),
    selectFormat(),
  ]);

  // Pick the content category that's most underrepresented
  const sortedDeviation = (Object.entries(mixStatus.deviation) as [ContentCategory, number][])
    .sort((a, b) => b[1] - a[1]);
  const contentCategory = sortedDeviation[0][0];

  // Pick the stalest river that's past cooldown
  const staleRivers = freshness.filter((r) => r.daysSince >= RIVER_COOLDOWN_DAYS);
  const targetRiver = formatDecision.river || staleRivers[0]?.slug || null;

  // Pick hook style based on content category
  const hookStyles: Record<ContentCategory, HookStyle> = {
    conditions: 'stat',
    educational: 'story',
    engagement: 'question',
    promotional: 'urgency',
  };

  // Pick audience segment
  const audiences: AudienceSegment[] = ['paddler', 'angler', 'family', 'general'];
  const audienceSegment = audiences[Math.floor(Math.random() * audiences.length)];

  // Find a clip if format is single
  let clipId: string | null = null;
  const clipIds: string[] = [];

  if (formatDecision.format === 'single' && targetRiver) {
    const { data: availableClips } = await supabase
      .from('clip_library')
      .select('id')
      .eq('river_slug', targetRiver)
      .eq('brand_check_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    clipId = availableClips?.[0]?.id || null;
  } else if (formatDecision.format === 'montage' || formatDecision.format === 'highlights') {
    // Get multiple clips for compilation
    let query = supabase
      .from('clip_library')
      .select('id')
      .eq('brand_check_status', 'approved')
      .order('heatmap_score', { ascending: false })
      .limit(5);

    if (formatDecision.river) {
      query = query.eq('river_slug', formatDecision.river);
    }

    const { data: compilationClips } = await query;
    for (const c of compilationClips || []) {
      clipIds.push(c.id);
    }
  }

  // If no clip found for single, fall back to any approved clip
  if (formatDecision.format === 'single' && !clipId) {
    const { data: anyClip } = await supabase
      .from('clip_library')
      .select('id')
      .eq('brand_check_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    clipId = anyClip?.[0]?.id || null;
  }

  const decision: ContentDecision = {
    postType: formatDecision.format === 'single' ? 'river_highlight' : 'daily_digest',
    format: formatDecision.format,
    contentCategory,
    audienceSegment,
    hookStyle: hookStyles[contentCategory],
    riverSlug: targetRiver,
    clipId,
    clipIds,
    montageTheme: formatDecision.theme,
    montageTitle: formatDecision.title,
    reasoning: `${formatDecision.reasoning}. Content gap: ${contentCategory} (${(sortedDeviation[0][1] * 100).toFixed(0)}% under target).${targetRiver ? ` River: ${targetRiver} (${staleRivers[0]?.daysSince || 0}d stale).` : ''}`,
  };

  console.log(`${LOG_PREFIX} Decision: ${decision.format} ${decision.contentCategory} for ${decision.riverSlug || 'general'}`);
  console.log(`${LOG_PREFIX} Reasoning: ${decision.reasoning}`);

  return decision;
}
