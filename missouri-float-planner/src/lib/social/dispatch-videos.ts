import type { SupabaseClient } from '@supabase/supabase-js';
import type { RenderData, VideoPostKind } from './post-types';
import type { ScheduledPost } from './types';
import { getCompositionForPost, shareTerrainMap, triggerVideoRender } from './video-renderer';

type Delivery = Pick<ScheduledPost, 'platform' | 'placement' | 'riverSlug' | 'caption' | 'hashtags' | 'imageUrl'>;

/** Save every destination in one insert before dispatching any render. Each callback owns its saved rows. */
export async function dispatchVideos(db: SupabaseClient, kind: VideoPostKind, data: RenderData, posts: Delivery[], autoPublish: boolean) {
  const rows = posts.map(post => {
    const id = crypto.randomUUID();
    const render = getCompositionForPost(kind, data, post.platform, post.placement);
    // Two picks generated the same day can feature different routes. Give each
    // saved video its own Blob path, including when it is rendered again.
    if (kind === 'section_guide') render.outputFilename = `${id}-${render.outputFilename}`;
    return {
      id, post_type: kind, platform: post.platform, river_slug: post.riverSlug,
      caption: post.caption, hashtags: post.hashtags, image_url: post.imageUrl, media_type: 'video',
      status: 'rendering', auto_publish: autoPublish, render_request: render,
    };
  });
  if (!rows.length) return { rendering: 0, warnings: ['No destinations selected'] };
  const { error } = await db.from('social_posts').insert(rows);
  if (error) throw new Error(error.message);

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.render_request.outputFilename;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const batches = [...groups.values()];
  const requests = await shareTerrainMap(batches.map(group => group[0].render_request));
  const warnings: string[] = [];
  let rendering = 0;
  for (const [index, group] of batches.entries()) {
    const ids = group.map(row => row.id);
    const dispatched = await triggerVideoRender({ ...requests[index], postIds: ids.join(',') }).catch(() => false);
    if (dispatched) {
      rendering += group.length;
    } else {
      const message = 'Video render could not start. Choose Render again in Post History.';
      await db.from('social_posts').update({ status: 'failed', error_message: message }).in('id', ids).eq('status', 'rendering');
      warnings.push(group[0].render_request.outputFilename + ': ' + message);
    }
  }
  return { rendering, warnings };
}
