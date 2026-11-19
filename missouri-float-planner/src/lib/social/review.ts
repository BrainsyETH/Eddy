import { DAILY_REPORT_KIND, isDailyReport, reportImageUrls, reportIsCurrent } from './daily-report';
import { isStoryRender } from './placements';
import type { PublishParams } from './types';
import { isDamStory, storyDam, type DamPostSnapshot } from '../../../shared/social-dam-schedule';

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
}, current?: DamPostSnapshot): PublishParams {
  if (isDamStory(post.render_request)) {
    // Only the explicit review action supplies a freshly checked schedule.
    if (!current) throw new Error('Dam videos need owner approval.');
    const props = post.render_request.inputProps;
    if (!props || props.sample !== false || !['instagram', 'tiktok'].includes(props.platform) ||
        props.platform !== post.platform || post.media_type !== 'video' || !isDamVideoUrl(post.video_url)) {
      throw new Error('This draft has no valid video for this destination. Create a new dam video.');
    }
    const saved = props.snapshot;
    if (!saved || storyDam(saved).id !== storyDam(current).id || storyDam(saved).name !== storyDam(current).name ||
        (saved.kind ?? 'schedule') !== (current.kind ?? 'schedule') || !Number.isFinite(Date.parse(saved.checkedAt))) {
      throw new Error('The dam or source has changed. Create a new dam video.');
    }
    if (saved.kind === 'forecast' && current.kind === 'forecast') {
      if (saved.scheduleDate !== current.scheduleDate || saved.generating !== current.generating || saved.source !== current.source ||
          !Array.isArray(saved.windows) || saved.windows.length !== current.windows.length || !current.windows.every((w, i) => w === saved.windows[i])) {
        throw new Error('The forecast has changed. Create a new dam video.');
      }
    } else if (saved.kind === 'release' && current.kind === 'release') {
      if (saved.scheduleDate !== current.scheduleDate || saved.checkedAt !== current.checkedAt || saved.releaseCfs !== current.releaseCfs ||
          !Array.isArray(saved.hourlyCfs) || saved.hourlyCfs.length !== 24 || !current.hourlyCfs.every((cfs, i) => cfs === saved.hourlyCfs[i])) {
        throw new Error('The measured release has changed. Create a new dam video.');
      }
    } else if ((!saved.kind || saved.kind === 'schedule') && (!current.kind || current.kind === 'schedule')) {
      if (!Array.isArray(saved.hourlyMw)) throw new Error('This video predates hourly megawatt bars. Create a new dam video.');
      if (saved.scheduleDate !== current.scheduleDate || saved.minimumFlow !== current.minimumFlow || saved.capacityMw !== current.capacityMw ||
          !Array.isArray(saved.hours) || saved.hours.length !== 24 || saved.hourlyMw.length !== 24 ||
          !current.hours.every((active, i) => active === saved.hours[i] && current.hourlyMw[i] === saved.hourlyMw[i])) {
        throw new Error('The schedule has changed. Create a new dam video.');
      }
    } else {
      throw new Error('Unrecognized data source. Create a new dam video.');
    }
    return {
      caption: post.caption, mediaType: 'video', videoUrl: post.video_url,
      ...(props.platform === 'instagram' && { placement: 'story' as const }),
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
    if (isStoryRender(post.render_request)) {
      return { caption: '', mediaType: 'video', videoUrl: post.video_url, placement: 'story' };
    }
    return { caption: post.caption, mediaType: 'video', videoUrl: post.video_url, coverUrl: post.image_url ?? undefined };
  }
  return { caption: post.caption, mediaType: 'image', imageUrl: post.image_url ?? undefined };
}
