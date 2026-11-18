import { DAILY_REPORT_KIND, isDailyReport, reportImageUrls, reportIsCurrent } from './daily-report';
import type { PublishParams } from './types';
import { isDamStory, type DamStorySnapshot } from '../../../shared/social-dam-schedule';

export function isDamVideoUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com') &&
      url.pathname.startsWith('/social-videos/') && !url.username && !url.password && !url.port;
  } catch { return false; }
}

/** Shared by review/retry: a failed video never silently becomes a photo. */
export function savedPostMedia(post: {
  platform?: string;
  caption: string; media_type: string; image_url: string | null; video_url: string | null; render_request?: unknown;
}, currentSchedule?: DamStorySnapshot): PublishParams {
  if (isDamStory(post.render_request)) {
    // Only the explicit review action supplies a freshly checked schedule.
    if (!currentSchedule) throw new Error('Dam videos need owner approval.');
    const props = post.render_request.inputProps;
    if (!props || props.sample !== false || !['instagram', 'tiktok'].includes(props.platform) ||
        props.platform !== post.platform || post.media_type !== 'video' || !isDamVideoUrl(post.video_url)) {
      throw new Error('This draft has no valid video for this destination. Create a new dam video.');
    }
    const saved = props.snapshot;
    if (!saved || !Number.isFinite(Date.parse(saved.checkedAt)) ||
        saved.scheduleDate !== currentSchedule.scheduleDate || saved.minimumFlow !== currentSchedule.minimumFlow ||
        !Array.isArray(saved.hours) || saved.hours.length !== 24 ||
        !currentSchedule.hours.every((active, i) => active === saved.hours[i])) {
      throw new Error('The schedule has changed. Create a new dam video.');
    }
    return {
      caption: post.caption, mediaType: 'video', videoUrl: post.video_url,
      ...(props.platform === 'instagram' && { instagramPlacement: 'story' as const }),
    };
  }
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
