// src/lib/social/insights-fetcher.ts
// Fetches Meta API engagement metrics for published posts.
//
// Queries Instagram and Facebook Graph API for impressions/views, reach, saves,
// shares and stores them on social_posts rows.
//
// Why this file is defensive: the Meta insights API fails the ENTIRE request if
// a single requested metric isn't valid for that media type or API version
// (e.g. `views` only applies to video/reels, `impressions` was removed for IG in
// v22+). Previously we requested one fixed metric set and, on any error, threw
// the whole thing away and returned null — which is why 0 of 600+ posts ever got
// insights. Now we walk a ladder of progressively smaller metric sets per media
// type and keep the first that succeeds, and we PROPAGATE the real Meta error to
// the caller (cron response + logs) instead of swallowing it, so a permissions
// gap (`instagram_manage_insights` / `read_insights`) is visible in seconds
// instead of failing silently forever.

import { createAdminClient } from '@/lib/supabase/admin';
import type { MediaType } from './types';

const LOG_PREFIX = '[InsightsFetcher]';
const GRAPH = 'https://graph.facebook.com/v24.0';

interface PostInsights {
  impressions?: number;
  reach?: number;
  saves?: number;
  shares?: number;
  engagement_rate?: number;
}

export interface InsightsFetchOutcome {
  insights: PostInsights | null;
  /** Real Meta error message when every attempt failed (null on success). */
  error: string | null;
}

/** One Graph insights call. Returns the metric rows, or a Meta error message. */
async function graphInsights(
  path: string,
  metrics: string[],
  token: string,
): Promise<{ rows: Array<{ name: string; values?: Array<{ value: unknown }> }> | null; error: string | null }> {
  const url = `${GRAPH}/${path}?metric=${metrics.join(',')}&access_token=${encodeURIComponent(token)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
      return { rows: null, error: data.error.message || `HTTP ${response.status}` };
    }
    return { rows: data.data || [], error: null };
  } catch (err) {
    return { rows: null, error: err instanceof Error ? err.message : 'network error' };
  }
}

/**
 * Try each candidate metric set in order; keep the first that returns without a
 * Meta error. This absorbs "metric X not supported for this media/version"
 * errors (which otherwise fail the whole call) by falling back to a smaller set,
 * while still surfacing a real error (e.g. a permissions denial) when even the
 * most minimal set fails.
 */
async function fetchWithLadder(
  path: string,
  ladder: string[][],
  token: string,
): Promise<{ rows: Array<{ name: string; values?: Array<{ value: unknown }> }> | null; error: string | null }> {
  let lastError: string | null = 'no metrics requested';
  for (const metrics of ladder) {
    const { rows, error } = await graphInsights(path, metrics, token);
    if (!error && rows) return { rows, error: null };
    lastError = error;
  }
  return { rows: null, error: lastError };
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/**
 * Fetch engagement insights from Meta Graph API for a single post.
 * Branches by platform + media type and returns the real error on failure.
 */
export async function fetchPostInsights(
  platformPostId: string,
  platform: 'instagram' | 'facebook',
  mediaType: MediaType,
): Promise<InsightsFetchOutcome> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { insights: null, error: 'META_PAGE_ACCESS_TOKEN not set' };

  if (platform === 'instagram') {
    // `views` (v22+) supersedes the removed `impressions`; it only applies to
    // some media types, so it heads a ladder that degrades to reach-only. Any
    // metric that isn't valid for THIS media just drops us to the next rung.
    const ladder = [
      ['views', 'reach', 'saved', 'shares'],
      ['reach', 'saved', 'shares'],
      ['reach', 'saved'],
      ['reach'],
    ];
    const { rows, error } = await fetchWithLadder(`${platformPostId}/insights`, ladder, token);
    if (!rows) {
      console.warn(`${LOG_PREFIX} Instagram insights failed for ${platformPostId}: ${error}`);
      return { insights: null, error };
    }
    const insights: PostInsights = {};
    for (const metric of rows) {
      const value = num(metric.values?.[0]?.value);
      switch (metric.name) {
        case 'views': insights.impressions = value; break;
        case 'reach': insights.reach = value; break;
        case 'saved': insights.saves = value; break;
        case 'shares': insights.shares = value; break;
      }
    }
    const denom = insights.impressions || insights.reach || 0;
    if (denom > 0) {
      insights.engagement_rate = ((insights.saves || 0) + (insights.shares || 0)) / denom;
    }
    return { insights, error: null };
  }

  // Facebook. Video posts are created via /{page}/videos, whose id is a VIDEO id
  // (a bare number) — post-level insights (post_impressions*) 404 on it, so those
  // must use the /video_insights edge. Photo/link posts return a real feed post id
  // ({pageid}_{postid}) and use /insights. This split is why FB video insights
  // never populated: the code hit /insights with a video id every time.
  if (mediaType === 'video') {
    const { rows, error } = await fetchWithLadder(
      `${platformPostId}/video_insights`,
      [['total_video_views'], ['total_video_impressions']],
      token,
    );
    if (!rows) {
      console.warn(`${LOG_PREFIX} Facebook video insights failed for ${platformPostId}: ${error}`);
      return { insights: null, error };
    }
    const insights: PostInsights = {};
    for (const metric of rows) {
      const value = num(metric.values?.[0]?.value);
      if (metric.name === 'total_video_views' || metric.name === 'total_video_impressions') {
        insights.impressions = value;
      }
    }
    return { insights, error: null };
  }

  const { rows, error } = await fetchWithLadder(
    `${platformPostId}/insights`,
    [['post_impressions', 'post_impressions_unique'], ['post_impressions']],
    token,
  );
  if (!rows) {
    console.warn(`${LOG_PREFIX} Facebook insights failed for ${platformPostId}: ${error}`);
    return { insights: null, error };
  }
  const insights: PostInsights = {};
  for (const metric of rows) {
    const value = num(metric.values?.[0]?.value);
    if (metric.name === 'post_impressions') insights.impressions = value;
    if (metric.name === 'post_impressions_unique') insights.reach = value;
  }
  // FB doesn't expose saves the way IG does; leave saves/shares/engagement_rate
  // null (undefined) rather than writing 0, which would skew averages.
  return { insights, error: null };
}

/**
 * Fetch and store insights for recently published posts.
 * Targets posts that are published in the last 7 days, have a platform_post_id,
 * and haven't had insights fetched in the last 24 hours.
 */
export async function fetchAllPendingInsights(): Promise<{
  processed: number;
  updated: number;
  errors: number;
  /** A few distinct Meta error messages, so a systemic cause (e.g. a missing
   *  permission) is visible in the cron response without digging through logs. */
  sampleErrors: string[];
}> {
  const supabase = createAdminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();

  const { data: posts, error } = await supabase
    .from('social_posts')
    .select('id, platform_post_id, platform, media_type')
    .eq('status', 'published')
    .neq('platform', 'tiktok') // no TikTok analytics API in v1
    .not('platform_post_id', 'is', null)
    .gte('published_at', sevenDaysAgo)
    .or(`insights_fetched_at.is.null,insights_fetched_at.lt.${oneDayAgo}`)
    .limit(50);

  if (error) {
    console.error(`${LOG_PREFIX} Error fetching posts:`, error);
    return { processed: 0, updated: 0, errors: 0, sampleErrors: [`query: ${error.message}`] };
  }

  const results = { processed: 0, updated: 0, errors: 0, sampleErrors: [] as string[] };
  const seenErrors = new Set<string>();

  for (const post of posts || []) {
    results.processed++;

    const { insights, error: metaError } = await fetchPostInsights(
      post.platform_post_id!,
      post.platform as 'instagram' | 'facebook',
      (post.media_type as MediaType) || 'image',
    );

    if (insights) {
      const { error: updateError } = await supabase
        .from('social_posts')
        .update({
          insights_impressions: insights.impressions ?? null,
          insights_reach: insights.reach ?? null,
          insights_saves: insights.saves ?? null,
          insights_shares: insights.shares ?? null,
          insights_engagement_rate: insights.engagement_rate ?? null,
          insights_fetched_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`${LOG_PREFIX} Error updating post ${post.id}:`, updateError);
        results.errors++;
      } else {
        results.updated++;
      }
    } else {
      // Left insights_fetched_at null on purpose so the post retries next run
      // (e.g. after the token is re-authed with the insights permission) until
      // it ages out of the 7-day window.
      results.errors++;
      if (metaError && !seenErrors.has(metaError) && seenErrors.size < 5) {
        seenErrors.add(metaError);
        results.sampleErrors.push(`${post.platform}: ${metaError}`);
      }
    }

    // Gentle rate limit between API calls.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `${LOG_PREFIX} Insights fetch complete: ${results.updated}/${results.processed} updated, ${results.errors} errors` +
    (results.sampleErrors.length ? ` — sample: ${results.sampleErrors.join(' | ')}` : ''),
  );
  return results;
}
