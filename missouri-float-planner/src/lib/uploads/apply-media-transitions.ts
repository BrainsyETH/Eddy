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
 * image_url; reject deletes stored copies (and clears image_url when one of
 * our public objects was removed). Failures are logged per row and never fail
 * the moderation call itself — the status change is already committed.
 */
export async function applyMediaTransitions(
  supabase: SupabaseClient,
  status: 'verified' | 'rejected' | 'pending',
  rows: MediaRow[],
): Promise<{ published: number; removed: number }> {
  let published = 0;
  let removed = 0;

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
          continue;
        }

        // Quarantine copy is redundant once published; removal failure is
        // harmless (private object) and intentionally non-fatal.
        await supabase.storage.from(QUARANTINE_BUCKET).remove([action.quarantinePath]);
        published += 1;
      } else {
        if (action.quarantinePath) {
          await supabase.storage.from(QUARANTINE_BUCKET).remove([action.quarantinePath]);
        }
        if (action.publicPath) {
          await supabase.storage.from(PUBLIC_IMAGE_BUCKET).remove([action.publicPath]);
          await supabase
            .from('community_reports')
            .update({ image_url: null })
            .eq('id', row.id);
        }
        removed += 1;
      }
    } catch (err) {
      logger.error('Media moderation transition failed', err, { reportId: row.id, status });
    }
  }

  return { published, removed };
}
