// src/lib/social/facebook-adapter.ts
// Facebook platform adapter implementing PlatformAdapter interface

import type { PlatformAdapter, PublishParams, PublishResult } from './types';
import { publishToFacebook, publishVideoToFacebook, hasMetaCredentials, validateToken } from './meta-client';

export class FacebookAdapter implements PlatformAdapter {
  platform = 'facebook' as const;

  async publishPost(params: PublishParams): Promise<PublishResult> {
    // Video posts use the /{page-id}/videos endpoint. If the caller asked
    // for video but did not provide a videoUrl (e.g. retry of a post whose
    // render failed), refuse — do NOT silently downgrade to an image feed
    // post, since that changes what the user sees without consent.
    if (params.mediaType === 'video') {
      if (!params.videoUrl) {
        return {
          success: false,
          error: 'Video post is missing videoUrl (render likely failed) — refusing to downgrade to image',
        };
      }
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
