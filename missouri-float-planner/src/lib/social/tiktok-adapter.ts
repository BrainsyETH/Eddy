// src/lib/social/tiktok-adapter.ts
// TikTok platform adapter implementing PlatformAdapter (draft / inbox-upload).
// TikTok is video-only in v1; there is no image path. The caption is NOT sent —
// draft mode has no title field, so the creator captions the post in-app when
// they finish it. (The generated caption is still stored on the social_posts row
// for reference.)

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasTikTokCredentials, isTikTokConnected, publishVideoToTikTok } from './tiktok-client';

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
    const result = await publishVideoToTikTok({ videoUrl: params.videoUrl }, supabase);
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
