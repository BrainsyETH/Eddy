// src/lib/social/instagram-adapter.ts
// Instagram platform adapter implementing PlatformAdapter interface

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { publishToInstagram, publishInstagramReel, hasInstagramCredentials, validateToken } from './meta-client';

export class InstagramAdapter implements PlatformAdapter {
  platform = 'instagram' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    // Route video posts to the Reels API
    if (params.mediaType === 'video' && params.videoUrl) {
      const result = await publishInstagramReel({
        caption: params.caption,
        videoUrl: params.videoUrl,
      });

      return {
        success: result.success,
        platformPostId: result.postId,
        error: result.error,
      };
    }

    // Image posts (existing behavior)
    if (!params.imageUrl) {
      return { success: false, error: 'Instagram requires an image for all posts' };
    }

    const result = await publishToInstagram({
      caption: params.caption,
      imageUrl: params.imageUrl,
    });

    return {
      success: result.success,
      platformPostId: result.postId,
      error: result.error,
    };
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasInstagramCredentials()) return false;
    const result = await validateToken();
    return result.valid;
  }
}
