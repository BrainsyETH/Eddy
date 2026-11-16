import { DAILY_REPORT_KIND, isDailyReport, reportImageUrls, reportIsCurrent } from './daily-report';
import type { PublishParams } from './types';

/** Shared by review/retry: a failed video never silently becomes a photo. */
export function savedPostMedia(post: {
  caption: string; media_type: string; image_url: string | null; video_url: string | null; render_request?: unknown;
}): PublishParams {
  const tagged = post.render_request && typeof post.render_request === 'object' && 'kind' in post.render_request && post.render_request.kind === DAILY_REPORT_KIND;
  if (tagged && !isDailyReport(post.render_request)) throw new Error('Invalid carousel snapshot. Generate a new draft.');
  if (isDailyReport(post.render_request)) {
    const imageUrls = reportImageUrls(post.render_request);
    if (!imageUrls) throw new Error('Carousel images are incomplete. Render again before publishing.');
    if (!reportIsCurrent(post.render_request)) {
      throw new Error('This Daily Report is out of date. Generate a new draft with current readings.');
    }
    return { caption: post.caption, mediaType: 'image', imageUrls };
  }
  if (post.media_type === 'video') {
    if (!post.video_url) throw new Error('No rendered video. Render again before publishing.');
    return { caption: post.caption, mediaType: 'video', videoUrl: post.video_url, coverUrl: post.image_url ?? undefined };
  }
  return { caption: post.caption, mediaType: 'image', imageUrl: post.image_url ?? undefined };
}
