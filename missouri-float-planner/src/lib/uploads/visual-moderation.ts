// src/lib/uploads/visual-moderation.ts
// Pure decision logic for community-photo moderation transitions (audit F15).
//
// Uploads land in the private 'images-quarantine' bucket and are only copied
// into the public 'images' bucket when a moderator verifies the report; on
// rejection every stored copy is deleted. This module decides WHAT storage
// work a status change requires — the admin route executes it — so the
// policy is unit-testable without Supabase.

export const QUARANTINE_BUCKET = 'images-quarantine';
export const PUBLIC_IMAGE_BUCKET = 'images';

// Exactly the shape /api/upload generates: community-visuals/YYYY-MM/<uuid>.webp
const QUARANTINE_PATH_RE =
  /^community-visuals\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

/** Whether a client-supplied string is a well-formed quarantine object path. */
export function isQuarantinePath(path: unknown): path is string {
  return typeof path === 'string' && QUARANTINE_PATH_RE.test(path);
}

/**
 * Extract the object path from one of OUR public-images-bucket URLs.
 * Returns null for any other URL (external images must never be deleted).
 */
export function publicImagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PUBLIC_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split('?')[0];
  return path.length > 0 ? decodeURIComponent(path) : null;
}

export interface ModerationMediaState {
  imagePath: string | null;
  imageUrl: string | null;
}

export type MediaAction =
  /** Copy quarantine object to the public bucket, set image_url, drop the quarantine copy. */
  | { kind: 'publish'; quarantinePath: string }
  /** Delete stored copies; null image_url when a public object of ours is removed. */
  | { kind: 'takedown'; quarantinePath: string | null; publicPath: string | null }
  | { kind: 'none' };

/**
 * Decide the storage work for a moderation status change.
 *
 * - verified: publish the quarantined object (if there is one and the report
 *   has no published URL yet — legacy rows with a public image_url need nothing).
 * - rejected: takedown — remove the quarantine copy and any published object
 *   in our public bucket. Rejection is terminal for media: a later re-verify
 *   cannot restore a deleted object and will simply have nothing to publish.
 * - pending: no storage change (un-verifying leaves published media in place;
 *   reject to take it down).
 */
export function planMediaTransition(
  newStatus: 'verified' | 'rejected' | 'pending',
  media: ModerationMediaState,
): MediaAction {
  if (newStatus === 'verified') {
    if (media.imagePath && !media.imageUrl && isQuarantinePath(media.imagePath)) {
      return { kind: 'publish', quarantinePath: media.imagePath };
    }
    return { kind: 'none' };
  }

  if (newStatus === 'rejected') {
    const quarantinePath = isQuarantinePath(media.imagePath) ? media.imagePath : null;
    const publicPath = publicImagePathFromUrl(media.imageUrl);
    if (quarantinePath || publicPath) {
      return { kind: 'takedown', quarantinePath, publicPath };
    }
    return { kind: 'none' };
  }

  return { kind: 'none' };
}
