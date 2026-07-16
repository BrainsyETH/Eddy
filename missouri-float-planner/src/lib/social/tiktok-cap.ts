// src/lib/social/tiktok-cap.ts
// TikTok draft-mode volume guard.
//
// TikTok's inbox (draft) upload allows "at most 5 pending shares within any
// 24-hour period" per user. Eddy can render more than 5 reels/day across all
// formats, so before adding a TikTok fan-out we check how many TikTok posts
// we've already put up in the last 24h. When the cap is reached we skip TikTok
// for that post (Facebook/Instagram still go out) rather than let the init call
// fail. This ceiling only lifts with a future direct-post (audited) phase.

export const TIKTOK_DAILY_CAP = 5;

/**
 * How many TikTok posts we've created in the last 24h. Counts rows that consumed
 * (or will consume) a draft slot — anything not failed/skipped. Returns 0 on a
 * query error so a transient DB blip never silently starves TikTok.
 */
export async function tiktokPostCount24h(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', 'tiktok')
    .gte('created_at', since)
    .in('status', ['rendering', 'publishing', 'published']);
  if (error) {
    console.warn(`[TikTokCap] count query failed, treating as 0: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/** Remaining TikTok draft slots in the current rolling 24h window (0..cap). */
export async function tiktokRemainingBudget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  return Math.max(0, TIKTOK_DAILY_CAP - (await tiktokPostCount24h(supabase)));
}

/** True when the 24h draft cap is already reached (single-post paths, e.g. alerts). */
export async function tiktokCapReached(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<boolean> {
  return (await tiktokPostCount24h(supabase)) >= TIKTOK_DAILY_CAP;
}
