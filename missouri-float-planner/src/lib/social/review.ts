import type { PublishParams } from './types';

/** Float Picks wait in Eddy's review queue on Meta; TikTok keeps its delivery flow. */
export function canAutoPublish(post: {
  post_type: string; platform: string; auto_publish?: boolean;
}): boolean {
  return post.auto_publish !== false && !(post.post_type === 'section_guide'
    && (post.platform === 'facebook' || post.platform === 'instagram'));
}

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
