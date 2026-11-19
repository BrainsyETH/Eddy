// The one path that saves video posts and starts their renders, for the cron,
// Quick Post and drafts alike.
//
// Destinations that produce the same video (same composition, props and
// filename) share one render: a Weekend Forecast for Facebook and Instagram
// is one file. Formats with per-destination layouts (Float Pick) get one
// render per destination because their filenames differ by platform and
// placement.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supportsStory, type RenderData, type VideoPostKind } from './post-types';
import type { ScheduledPost } from './types';
import { getCompositionForPost, shareTerrainMap, triggerVideoRender } from './video-renderer';

type Delivery = Pick<ScheduledPost, 'platform' | 'placement' | 'riverSlug' | 'caption' | 'hashtags' | 'imageUrl'> &
  Partial<Pick<ScheduledPost, 'eddyUpdateId'>>;

export interface UndispatchedPost {
  id: string;
  delivery: Delivery;
}

export interface DispatchResult {
  rendering: number;
  warnings: string[];
  /** Rows whose render never started. Still `rendering` only with `keepUndispatched`. */
  undispatched: UndispatchedPost[];
}

/**
 * Whether a scheduled post whose render cannot start should publish its cover
 * image instead. Per-destination layouts can't: an image is not a Story, and
 * those posts wait in History for Render again.
 */
export function fallsBackToImage(kind: string): boolean {
  return !supportsStory(kind);
}

/**
 * Save every destination in one insert before dispatching any render; each
 * render callback owns the rows named in its post ids.
 *
 * By default a render that cannot start marks its rows failed. With
 * `keepUndispatched` they stay `rendering` and are returned, so the caller
 * can claim them for its own fallback.
 */
export async function dispatchVideos(
  db: SupabaseClient,
  kind: VideoPostKind,
  data: RenderData,
  posts: Delivery[],
  autoPublish: boolean,
  options: { keepUndispatched?: boolean } = {},
): Promise<DispatchResult> {
  const rows = posts.map(post => ({
    id: crypto.randomUUID(),
    delivery: post,
    render: getCompositionForPost(kind, data, post.platform, post.placement),
  }));
  if (!rows.length) return { rendering: 0, warnings: ['No destinations selected'], undispatched: [] };

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = groups.get(row.render.outputFilename) ?? [];
    group.push(row);
    groups.set(row.render.outputFilename, group);
  }
  // Two posts of a format on the same day (a draft and the scheduled post, or
  // two Float Picks with different routes) must not overwrite one file. Each
  // group's file is named after its first row, which also survives rerenders.
  for (const group of groups.values()) {
    for (const row of group) row.render.outputFilename = `${group[0].id}-${row.render.outputFilename}`;
  }

  const { error } = await db.from('social_posts').insert(rows.map(({ id, delivery, render }) => ({
    id, post_type: kind, platform: delivery.platform, river_slug: delivery.riverSlug,
    caption: delivery.caption, hashtags: delivery.hashtags, image_url: delivery.imageUrl,
    eddy_update_id: delivery.eddyUpdateId ?? null, media_type: 'video',
    status: 'rendering', auto_publish: autoPublish, render_request: render,
  })));
  if (error) throw new Error(error.message);

  const batches = [...groups.values()];
  const requests = await shareTerrainMap(batches.map(group => group[0].render));
  const warnings: string[] = [];
  const undispatched: UndispatchedPost[] = [];
  let rendering = 0;
  for (const [index, group] of batches.entries()) {
    const ids = group.map(row => row.id);
    const dispatched = await triggerVideoRender({ ...requests[index], postIds: ids.join(',') }).catch(() => false);
    if (dispatched) {
      rendering += group.length;
      continue;
    }
    undispatched.push(...group.map(({ id, delivery }) => ({ id, delivery })));
    if (options.keepUndispatched) continue;
    const message = 'Video render could not start. Choose Render again in Post History.';
    await db.from('social_posts').update({ status: 'failed', error_message: message }).in('id', ids).eq('status', 'rendering');
    warnings.push(group[0].render.outputFilename + ': ' + message);
  }
  return { rendering, warnings, undispatched };
}
