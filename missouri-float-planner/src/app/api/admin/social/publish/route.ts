// src/app/api/admin/social/publish/route.ts
// POST /api/admin/social/publish — Publish a manual/ad-hoc post to selected platforms

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { outcomeFields, providerAttemptRecorder, thrownFields, writeOutcome } from '@/lib/social/publish-outcome';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform } from '@/lib/social/types';
import { rateLimit } from '@/lib/rate-limit';
import {
  CLAIM_SECONDS,
  DUPLICATE_WINDOW_MINUTES,
  duplicateMessage,
  findBlockingDuplicate,
  isPublishableImageUrl,
  manualPublishKey,
  type RecentManualPost,
} from '@/lib/social/manual-publish-guard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { caption, imageUrl, platforms } = body as {
    caption?: string;
    imageUrl?: string;
    platforms?: string[];
  };

  if (typeof caption !== 'string' || !caption.trim()) {
    return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
  }
  if (imageUrl !== undefined && imageUrl !== null && imageUrl !== '') {
    if (typeof imageUrl !== 'string' || !isPublishableImageUrl(imageUrl)) {
      return NextResponse.json({ error: 'Image URL must be a public https link' }, { status: 400 });
    }
  }

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const validPlatforms = platforms.filter(
    (p): p is SocialPlatform => p === 'facebook' || p === 'instagram'
  );

  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'No valid platforms selected' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results: Array<{ platform: string; success: boolean; error?: string; postId?: string; duplicate?: boolean }> = [];

  for (const platform of validPlatforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, success: false, error: `No credentials configured for ${platform}` });
      continue;
    }

    // Refuse a repeat before anything is created or sent. The claim is atomic
    // (two simultaneous requests cannot both pass); the history check covers a
    // retry that arrives after the first request finished.
    const claimKey = manualPublishKey(platform, caption, imageUrl);
    const alreadyClaimed = await rateLimit(`social-manual-publish:${claimKey}`, 1, CLAIM_SECONDS * 1000, {
      failClosed: true,
    });
    if (alreadyClaimed) {
      results.push({
        platform,
        success: false,
        duplicate: true,
        error:
          alreadyClaimed.status === 429
            ? duplicateMessage(platform, null)
            : 'Could not confirm this is not a repeat post, so nothing was sent. Try again shortly.',
      });
      continue;
    }

    const { data: recent, error: recentError } = await supabase
      .from('social_posts')
      .select('status, image_url, created_at')
      .eq('post_type', 'manual')
      .eq('platform', platform)
      .eq('caption', caption.trim())
      .gte('created_at', new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (recentError) {
      results.push({
        platform,
        success: false,
        error: 'Could not check for an earlier identical post, so nothing was sent.',
      });
      continue;
    }
    const earlier = findBlockingDuplicate((recent ?? []) as RecentManualPost[], imageUrl);
    if (earlier) {
      results.push({ platform, success: false, duplicate: true, error: duplicateMessage(platform, earlier) });
      continue;
    }

    // Create pending record
    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'manual',
        platform,
        river_slug: null,
        caption: caption.trim(),
        image_url: imageUrl || null,
        hashtags: [],
        eddy_update_id: null,
        status: 'publishing',
      })
      .select('id')
      .single();

    if (insertError) {
      results.push({ platform, success: false, error: insertError.message });
      continue;
    }

    try {
      const publishResult = await adapter.publishPost({
        caption: caption.trim(),
        imageUrl: imageUrl || '',
        onProviderAttempt: providerAttemptRecorder(supabase, record.id),
      });
      // An ambiguous failure is `unknown`, never `failed`; an inbox delivery is
      // `inbox`, not `published` (publish-outcome.ts).
      await writeOutcome(supabase, record.id, outcomeFields(publishResult));
      results.push(
        publishResult.success
          ? { platform, success: true, postId: publishResult.platformPostId }
          : { platform, success: false, error: publishResult.error },
      );
    } catch (err) {
      // A throw does not prove the platform refused the post.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await writeOutcome(supabase, record.id, thrownFields(err));
      results.push({ platform, success: false, error: `outcome unknown — ${msg}` });
    }
  }

  // Awaited: an un-awaited write can be dropped when the function is frozen
  // after the response, and this is the record of a public post.
  const audit = await logAdminAction({
    action: 'publish_manual_post',
    entityType: 'social_post',
    details: {
      platforms: validPlatforms,
      results: results.map(r => ({
        platform: r.platform,
        success: r.success,
        duplicate: r.duplicate === true,
        postId: r.postId ?? null,
      })),
    },
  });
  if (!audit.ok) console.error('[SocialPublish] audit log not written:', audit.error);

  return NextResponse.json({ results });
}
