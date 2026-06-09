// src/lib/social/insights-fetcher.ts
// Fetches Meta API engagement metrics for published posts.
// Ported from ClawsifiedInfo fetch-insights.sh
//
// Queries Instagram and Facebook Graph API for impressions, reach, saves, shares.
// Stores results on social_posts rows.

import { createAdminClient } from '@/lib/supabase/admin';

const LOG_PREFIX = '[InsightsFetcher]';

interface PostInsights {
  impressions?: number;
  reach?: number;
  saves?: number;
  shares?: number;
  engagement_rate?: number;
}

/**
 * Fetch engagement insights from Meta Graph API for a single post.
 */
async function fetchPostInsights(
  platformPostId: string,
  platform: 'instagram' | 'facebook',
): Promise<PostInsights | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return null;

  try {
    if (platform === 'instagram') {
      // Instagram Insights API
      const metrics = 'impressions,reach,saved,shares';
      const url = `https://graph.facebook.com/v24.0/${platformPostId}/insights?metric=${metrics}&access_token=${token}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.warn(`${LOG_PREFIX} Instagram insights error for ${platformPostId}: ${data.error.message}`);
        return null;
      }

      const insights: PostInsights = {};
      for (const metric of data.data || []) {
        const value = metric.values?.[0]?.value ?? 0;
        switch (metric.name) {
          case 'impressions': insights.impressions = value; break;
          case 'reach': insights.reach = value; break;
          case 'saved': insights.saves = value; break;
          case 'shares': insights.shares = value; break;
        }
      }

      // Calculate engagement rate
      if (insights.impressions && insights.impressions > 0) {
        const engagements = (insights.saves || 0) + (insights.shares || 0);
        insights.engagement_rate = engagements / insights.impressions;
      }

      return insights;
    }

    if (platform === 'facebook') {
      // Facebook Post Insights
      const metrics = 'post_impressions,post_impressions_unique,post_reactions_by_type_total';
      const url = `https://graph.facebook.com/v24.0/${platformPostId}/insights?metric=${metrics}&access_token=${token}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.warn(`${LOG_PREFIX} Facebook insights error for ${platformPostId}: ${data.error.message}`);
        return null;
      }

      const insights: PostInsights = {};
      for (const metric of data.data || []) {
        const value = metric.values?.[0]?.value ?? 0;
        switch (metric.name) {
          case 'post_impressions': insights.impressions = typeof value === 'number' ? value : 0; break;
          case 'post_impressions_unique': insights.reach = typeof value === 'number' ? value : 0; break;
        }
      }

      if (insights.impressions && insights.impressions > 0) {
        insights.engagement_rate = 0; // Facebook doesn't expose saves/shares the same way
      }

      return insights;
    }

    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching insights for ${platformPostId}:`, error);
    return null;
  }
}

/**
 * Fetch and store insights for all recently published posts.
 * Targets posts that are:
 *  - Published in the last 7 days
 *  - Have a platform_post_id
 *  - Haven't had insights fetched in the last 24 hours
 */
export async function fetchAllPendingInsights(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const supabase = createAdminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();

  // Find posts needing insights updates
  const { data: posts, error } = await supabase
    .from('social_posts')
    .select('id, platform_post_id, platform')
    .eq('status', 'published')
    .not('platform_post_id', 'is', null)
    .gte('published_at', sevenDaysAgo)
    .or(`insights_fetched_at.is.null,insights_fetched_at.lt.${oneDayAgo}`)
    .limit(50);

  if (error) {
    console.error(`${LOG_PREFIX} Error fetching posts:`, error);
    return { processed: 0, updated: 0, errors: 0 };
  }

  const results = { processed: 0, updated: 0, errors: 0 };

  for (const post of posts || []) {
    results.processed++;

    const insights = await fetchPostInsights(
      post.platform_post_id!,
      post.platform as 'instagram' | 'facebook',
    );

    if (insights) {
      const { error: updateError } = await supabase
        .from('social_posts')
        .update({
          impressions: insights.impressions,
          reach: insights.reach,
          saves: insights.saves,
          shares: insights.shares,
          engagement_rate: insights.engagement_rate,
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
      results.errors++;
    }

    // Rate limit: small delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`${LOG_PREFIX} Insights fetch complete: ${results.updated}/${results.processed} updated, ${results.errors} errors`);
  return results;
}
