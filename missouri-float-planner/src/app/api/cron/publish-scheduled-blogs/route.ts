import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';
async function handleGET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !hasValidMachineBearer(request.headers.get('authorization'), secret)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Atomic status/date predicate makes overlapping ticks idempotent.
  const { data, error } = await createAdminClient()
    .from('blog_posts')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('status', 'scheduled')
    .lte('published_at', new Date().toISOString())
    .select('id,slug,title');
  if (error)
    return NextResponse.json(
      { error: 'Scheduled publication failed' },
      { status: 503 },
    );
  for (const post of data ?? []) revalidatePath(`/blog/${post.slug}`);
  if (data?.length) {
    revalidatePath('/blog');
    revalidatePath('/sitemap.xml');
    revalidatePath('/blog/feed.xml');
  }
  return NextResponse.json({ published: data?.length ?? 0 });
}
export const GET = withJobRun('publish-scheduled-blogs', handleGET);
