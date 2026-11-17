import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isValidUUID } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDamStory } from '@shared/social-dam-schedule';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid export.' }, { status: 400 });
  const { data: post } = await createAdminClient().from('social_posts').select('video_url,render_request,status').eq('id', id).single();
  if (!post || !isDamStory(post.render_request) || post.status !== 'review' || !post.video_url) return NextResponse.json({ error: 'The video is not ready to download.' }, { status: 409 });
  // Only proxy the saved renderer output, never a URL from the request.
  let url: URL;
  try { url = new URL(post.video_url); } catch { return NextResponse.json({ error: 'Invalid video URL.' }, { status: 502 }); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !url.pathname.startsWith('/social-videos/') || url.username || url.password || url.port) {
    return NextResponse.json({ error: 'Unrecognized video source.' }, { status: 502 });
  }
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) throw new Error('Download failed');
    return new Response(response.body, { headers: {
      'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename="eddy-dam-schedule-${id}.mp4"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return NextResponse.json({ error: 'Could not download the video. Try again.' }, { status: 502 }); }
}
