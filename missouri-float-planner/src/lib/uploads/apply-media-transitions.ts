// src/lib/uploads/apply-media-transitions.ts
// Executes the storage side of a community-photo moderation decision (audit
// F15). Shared by both moderation entry points — the bulk PATCH on
// /api/admin/reports and the single-report PUT on /api/admin/reports/[id] — so
// verifying a photo publishes its quarantined object no matter which button a
// moderator uses.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planMediaTransition,
  QUARANTINE_BUCKET,
  PUBLIC_IMAGE_BUCKET,
} from '@/lib/uploads/visual-moderation';
import { logger } from '@/lib/logger';

export interface MediaRow {
  id: string;
  image_path: string | null;
  image_url: string | null;
}

/**
 * Execute the storage side of a moderation decision for each affected report:
 * verify publishes the quarantined object into the public bucket and stamps
 * image_url; reject deletes stored copies. Failures are logged per row and
 * never fail the moderation call itself — the status change is already
 * committed — but they are COUNTED in `failed`, so a caller can say so.
 *
 * A takedown clears image_path / image_url only for an object whose delete
 * succeeded. Storage reports failure as a returned `{ error }`, not a throw;
 * clearing the reference regardless used to leave a public photo reachable at
 * its URL with nothing left in the row to retry the delete from. A rejected
 * row that still carries a reference is therefore outstanding cleanup, and
 * running the takedown again finishes it.
 */
export async function applyMediaTransitions(
  supabase: SupabaseClient,
  status: 'verified' | 'rejected' | 'pending',
  rows: MediaRow[],
): Promise<{ published: number; removed: number; failed: number }> {
  let published = 0;
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    const action = planMediaTransition(status, {
      imagePath: row.image_path,
      imageUrl: row.image_url,
    });
    if (action.kind === 'none') continue;

    try {
      if (action.kind === 'publish') {
        const { error: copyError } = await supabase.storage
          .from(QUARANTINE_BUCKET)
          .copy(action.quarantinePath, action.quarantinePath, {
            destinationBucket: PUBLIC_IMAGE_BUCKET,
          });
        // "already exists" means a previous partial run copied it — publishing
        // can proceed; anything else leaves the row unpublished for retry.
        if (copyError && !/exists|duplicate/i.test(copyError.message)) {
          logger.error('Could not publish moderated image', copyError, { reportId: row.id });
          failed += 1;
          continue;
        }

        const { data: pub } = supabase.storage
          .from(PUBLIC_IMAGE_BUCKET)
          .getPublicUrl(action.quarantinePath);
        const { error: updateError } = await supabase
          .from('community_reports')
          .update({ image_url: pub.publicUrl })
          .eq('id', row.id);
        if (updateError) {
          logger.error('Could not record published image URL', updateError, { reportId: row.id });
          failed += 1;
          continue;
        }

        // Quarantine copy is redundant once published; removal failure is
        // harmless (private object) and intentionally non-fatal.
        await supabase.storage.from(QUARANTINE_BUCKET).remove([action.quarantinePath]);
        published += 1;
      } else {
        const cleared: { image_path?: null; image_url?: null } = {};
        let complete = true;
        if (action.quarantinePath) {
          const { error } = await supabase.storage.from(QUARANTINE_BUCKET).remove([action.quarantinePath]);
          if (error) {
            logger.error('Could not delete quarantined image', error, { reportId: row.id });
            complete = false;
          } else {
            cleared.image_path = null;
          }
        }
        if (action.publicPath) {
          const { error } = await supabase.storage.from(PUBLIC_IMAGE_BUCKET).remove([action.publicPath]);
          if (error) {
            logger.error('Could not delete published image', error, { reportId: row.id });
            complete = false;
          } else {
            cleared.image_url = null;
          }
        }
        if (Object.keys(cleared).length > 0) {
          const { error } = await supabase.from('community_reports').update(cleared).eq('id', row.id);
          if (error) {
            logger.error('Could not clear deleted image references', error, { reportId: row.id });
            complete = false;
          }
        }
        if (complete) removed += 1;
        else failed += 1;
      }
    } catch (err) {
      logger.error('Media moderation transition failed', err, { reportId: row.id, status });
      failed += 1;
    }
  }

  return { published, removed, failed };
}
