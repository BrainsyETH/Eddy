// src/app/api/admin/social/publish/route.ts
// POST /api/admin/social/publish — Publish a manual/ad-hoc post to selected platforms

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

function getAdapter(platform: SocialPlatform) {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

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

  if (!caption || !caption.trim()) {
    return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
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
  const results: Array<{ platform: string; success: boolean; error?: string; postId?: string }> = [];

  for (const platform of validPlatforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, success: false, error: `No credentials configured for ${platform}` });
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
      });

      if (publishResult.success) {
        await supabase
          .from('social_posts')
          .update({
            status: 'published',
            platform_post_id: publishResult.platformPostId || null,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        results.push({ platform, success: true, postId: publishResult.platformPostId });
      } else {
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: publishResult.error || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        results.push({ platform, success: false, error: publishResult.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      results.push({ platform, success: false, error: msg });
    }
  }

  logAdminAction({
    action: 'publish_manual_post',
    entityType: 'social_post',
    details: {
      platforms: validPlatforms,
      results: results.map(r => ({ platform: r.platform, success: r.success })),
    },
  });

  return NextResponse.json({ results });
}
