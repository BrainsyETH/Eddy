import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SocialPlatform } from './types';
import { reportCaption, type DailyReport } from './daily-report';

export async function triggerReportRender(postIds: string[]): Promise<boolean> {
  if (!postIds.length || postIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return false;
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) return false;
  const owner = process.env.GH_REPO_OWNER || 'BrainsyETH';
  const repo = process.env.GH_REPO_NAME || 'Eddy';
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/render-daily-report.yml/dispatches`, {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: process.env.GH_ACTIONS_REF || 'main', inputs: { post_ids: postIds.join(',') } }),
  });
  return response.status === 204;
}

/** Manual and scheduled paths store the same snapshot before rendering. */
export async function dispatchDailyReport(report: DailyReport, platforms: SocialPlatform[], autoPublish: boolean) {
  const supabase = createAdminClient();
  const ids: string[] = [];
  const errors: string[] = [];
  const { caption, hashtags } = reportCaption(report);
  for (const platform of [...new Set(platforms)].filter(p => p !== 'tiktok')) {
    if (autoPublish) {
      // Retain failed attempts in history while freeing the existing UTC-day
      // uniqueness slot. They can no longer auto-retry an obsolete snapshot.
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const { error } = await supabase.from('social_posts').update({ auto_publish: false })
        .eq('post_type', 'daily_digest').eq('platform', platform).eq('auto_publish', true)
        .eq('status', 'failed').gte('created_at', dayStart.toISOString());
      if (error) { errors.push(`${platform}: previous report could not be retired`); continue; }
    }
    const { data, error } = await supabase.from('social_posts').insert({
      post_type: 'daily_digest', platform, river_slug: null, caption, hashtags,
      media_type: 'image', image_url: null, status: 'rendering', auto_publish: autoPublish,
      render_request: JSON.parse(JSON.stringify(report)),
    }).select('id').single();
    if (error || !data) errors.push(`${platform}: ${error?.message ?? 'Draft could not be saved'}`);
    else ids.push(data.id);
  }
  if (!ids.length) return { rendering: 0, warnings: errors };
  const dispatched = await triggerReportRender(ids).catch(() => false);
  if (!dispatched) {
    const message = 'Daily Report render could not start. Check GH_ACTIONS_TOKEN and render-daily-report.yml.';
    const { error } = await supabase.from('social_posts').update({ status: 'failed', error_message: message }).in('id', ids).eq('status', 'rendering');
    errors.push(message);
    if (error) errors.push('Could not save render failure; refresh post history.');
  }
  return { rendering: dispatched ? ids.length : 0, warnings: errors };
}
