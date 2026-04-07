// src/lib/social/instagram-adapter.ts
// Instagram platform adapter implementing PlatformAdapter interface

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { publishToInstagram, publishVideoToInstagram, hasInstagramCredentials, validateToken } from './meta-client';

export class InstagramAdapter implements PlatformAdapter {
  platform = 'instagram' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    // Video posts use the Reels container flow
    if (params.mediaType === 'video' && params.videoUrl) {
      const result = await publishVideoToInstagram({
        caption: params.caption,
        videoUrl: params.videoUrl,
      });
      return {
        success: result.success,
        platformPostId: result.postId,
        error: result.error,
      };
    }

    // Image posts (default)
    if (!params.imageUrl) {
      return { success: false, error: 'Instagram requires an image or video for all posts' };
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
