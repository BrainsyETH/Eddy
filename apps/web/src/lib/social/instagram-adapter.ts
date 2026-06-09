// src/lib/social/instagram-adapter.ts
// Instagram platform adapter implementing PlatformAdapter interface

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { publishToInstagram, publishVideoToInstagram, hasInstagramCredentials, validateToken } from './meta-client';

export class InstagramAdapter implements PlatformAdapter {
  platform = 'instagram' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    // Video posts use the Reels container flow. If the caller asked for
    // video but did not provide a videoUrl (e.g. retry of a post whose
    // render failed), refuse — do NOT silently downgrade to an image feed
    // post, since that changes what the user sees without consent.
    if (params.mediaType === 'video') {
      if (!params.videoUrl) {
        return {
          success: false,
          error: 'Video post is missing videoUrl (render likely failed) — refusing to downgrade to image',
        };
      }
      const result = await publishVideoToInstagram({
        caption: params.caption,
        videoUrl: params.videoUrl,
        coverUrl: params.coverUrl,
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
