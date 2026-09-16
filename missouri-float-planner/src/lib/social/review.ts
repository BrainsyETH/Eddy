import type { PublishParams } from './types';

/** Shared by review/retry: a failed video never silently becomes a photo. */
export function savedPostMedia(post: {
  caption: string; media_type: string; image_url: string | null; video_url: string | null;
}): PublishParams {
  if (post.media_type === 'video') {
    if (!post.video_url) throw new Error('No rendered video. Render again before publishing.');
    return { caption: post.caption, mediaType: 'video', videoUrl: post.video_url, coverUrl: post.image_url ?? undefined };
  }
  return { caption: post.caption, mediaType: 'image', imageUrl: post.image_url ?? undefined };
}
