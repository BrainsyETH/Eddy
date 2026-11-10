import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { dailyReportAutoPublishEnabled, isDailyReport, reportImageUrls } from '@/lib/social/daily-report';
import { savedPostMedia } from '@/lib/social/review';
import { getAdapter } from '@/lib/social/adapters';
import { outcomeFields, providerAttemptRecorder, thrownFields, writeOutcome } from '@/lib/social/publish-outcome';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!hasValidMachineBearer(request.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ids: string[] = typeof body?.postIds === 'string' ? body.postIds.split(',') : [];
  if (!ids.length || ids.length > 2 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id)) || !['rendered', 'failed'].includes(body.status)) return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  const supabase = createAdminClient();
  for (const id of ids) {
    const { data: post, error } = await supabase.from('social_posts').select('*').eq('id', id).single();
    if (error || !post) return NextResponse.json({ error: 'Post lookup failed' }, { status: 500 });
    if (post.status !== 'rendering') continue;
    if (post.post_type !== 'daily_digest' || !isDailyReport(post.render_request)) return NextResponse.json({ error: 'Not a Daily Report' }, { status: 400 });
    if (body.status === 'failed') {
      const { error: failed } = await supabase.from('social_posts').update({ status: 'failed', error_message: 'Daily Report render failed. Check the workflow logs.', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'rendering');
      if (failed) return NextResponse.json({ error: 'Could not save failure' }, { status: 500 });
      continue;
    }
    const report = { ...post.render_request, imageUrls: body.imageUrls };
    const urls = reportImageUrls(report);
    if (!urls || body.capturedAt !== report.capturedAt) return NextResponse.json({ error: 'Incomplete or mismatched carousel' }, { status: 400 });
    const review = post.auto_publish === false || !dailyReportAutoPublishEnabled();
    const { data: claimed, error: claimError } = await supabase.from('social_posts').update({
      render_request: JSON.parse(JSON.stringify(report)), image_url: urls[0],
      status: review ? 'review' : 'publishing', error_message: null, updated_at: new Date().toISOString(),
      ...(review ? { auto_publish: false } : {}),
    }).eq('id', id).eq('status', 'rendering').select('id');
    if (claimError) return NextResponse.json({ error: 'Could not save rendered carousel' }, { status: 500 });
    if (!claimed?.length || review) continue;
    try {
      const adapter = getAdapter(post.platform as SocialPlatform);
      if (!adapter) {
        await writeOutcome(supabase, id, outcomeFields({ success: false, error: 'Platform is not connected' }));
        continue;
      }
      let media;
      try { media = savedPostMedia({ ...post, render_request: report }); }
      catch (e) { await writeOutcome(supabase, id, outcomeFields({ success: false, error: (e as Error).message })); continue; }
      const result = await adapter.publishPost({ ...media, onProviderAttempt: providerAttemptRecorder(supabase, id) });
      await writeOutcome(supabase, id, outcomeFields(result));
    } catch (e) {
      await writeOutcome(supabase, id, thrownFields(e));
    }
  }
  return NextResponse.json({ success: true });
}
