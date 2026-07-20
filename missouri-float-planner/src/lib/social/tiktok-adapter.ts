// src/lib/social/tiktok-adapter.ts
// TikTok platform adapter implementing PlatformAdapter. TikTok is video-only.
// Two modes (TIKTOK_DIRECT_POST):
//   draft  (default) — upload to the inbox; the creator captions + posts in-app.
//                      The API has no title field, so the caption is NOT sent
//                      (it's still stored on the row for the copy-caption helper).
//   direct (audited) — publish straight to the profile with the caption as the
//                      title, no manual step. Requires the video.publish scope.

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  hasTikTokCredentials,
  isTikTokConnected,
  isTikTokDirectPost,
  publishVideoToTikTok,
  publishVideoToTikTokDirect,
} from './tiktok-client';

export class TikTokAdapter implements PlatformAdapter {
  platform = 'tiktok' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    if (params.mediaType !== 'video' || !params.videoUrl) {
      return {
        success: false,
        error: 'TikTok supports video posts only (missing videoUrl or non-video mediaType)',
      };
    }

    const supabase = createAdminClient();
    const result = isTikTokDirectPost()
      ? await publishVideoToTikTokDirect({ videoUrl: params.videoUrl, caption: params.caption }, supabase)
      : await publishVideoToTikTok({ videoUrl: params.videoUrl }, supabase);
    return {
      success: result.success,
      platformPostId: result.postId,
      error: result.error,
    };
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasTikTokCredentials()) return false;
    return isTikTokConnected(createAdminClient());
  }
}
