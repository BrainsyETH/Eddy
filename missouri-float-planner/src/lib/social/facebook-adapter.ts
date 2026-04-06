// src/lib/social/facebook-adapter.ts
// Facebook platform adapter implementing PlatformAdapter interface

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { publishToFacebook, publishVideoToFacebook, hasMetaCredentials, validateToken } from './meta-client';

export class FacebookAdapter implements PlatformAdapter {
  platform = 'facebook' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    // Video posts use the /{page-id}/videos endpoint
    if (params.mediaType === 'video' && params.videoUrl) {
      const result = await publishVideoToFacebook({
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
    const result = await publishToFacebook({
      caption: params.caption,
      imageUrl: params.imageUrl || '',
    });

    return {
      success: result.success,
      platformPostId: result.postId,
      error: result.error,
    };
  }

  async validateCredentials(): Promise<boolean> {
    if (!hasMetaCredentials()) return false;
    const result = await validateToken();
    return result.valid;
  }
}
