// src/lib/social/manual-publish-guard.ts
// Stops one manual post from reaching a platform twice.
//
// The compose button disables itself while a request is in flight, but that
// only covers one tab. A retried request, a second tab, or a replayed call
// reaches the route as a brand-new publish, and a public post cannot be taken
// back. The server therefore decides, per platform:
//
//   1. a short atomic claim on (platform, caption, image) — two requests that
//      arrive together cannot both pass, and
//   2. a look at recent history — an identical manual post that was sent, is
//      being sent, or whose outcome is unknown blocks a resend.
//
// A post that definitely FAILED does not block: retrying that is the point.

import { createHash } from 'crypto';

/** Minutes during which an identical manual post is treated as a repeat. */
export const DUPLICATE_WINDOW_MINUTES = 15;
/** Seconds the in-flight claim is held; longer than a publish call takes. */
export const CLAIM_SECONDS = 90;

/** Statuses that mean "this may already be public" — never resend over these. */
export const BLOCKING_STATUSES = ['publishing', 'published', 'inbox', 'unknown', 'rendering'] as const;

export function manualPublishKey(platform: string, caption: string, imageUrl: string | null | undefined): string {
  return createHash('sha256')
    .update(JSON.stringify([platform, caption.trim(), imageUrl || '']))
    .digest('hex');
}

export interface RecentManualPost {
  status: string;
  image_url: string | null;
  created_at: string;
}

/** The recent row that makes this publish a repeat, if any. */
export function findBlockingDuplicate(
  recent: RecentManualPost[],
  imageUrl: string | null | undefined,
  now: Date = new Date(),
): RecentManualPost | null {
  const cutoff = now.getTime() - DUPLICATE_WINDOW_MINUTES * 60_000;
  const blocking: readonly string[] = BLOCKING_STATUSES;
  return (
    recent.find(
      (row) =>
        blocking.includes(row.status) &&
        (row.image_url || '') === (imageUrl || '') &&
        new Date(row.created_at).getTime() >= cutoff,
    ) ?? null
  );
}

export function duplicateMessage(platform: string, row: RecentManualPost | null, now: Date = new Date()): string {
  if (!row) {
    return `An identical post to ${platform} was submitted in the last ${CLAIM_SECONDS} seconds. Not sent again — check Post History before retrying.`;
  }
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(row.created_at).getTime()) / 60_000));
  const when = minutes < 1 ? 'moments ago' : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const state =
    row.status === 'published' || row.status === 'inbox'
      ? 'was already sent'
      : row.status === 'unknown'
        ? 'was attempted and its outcome is unknown — check the platform'
        : 'is already being sent';
  return `An identical post to ${platform} ${state} (${when}). Not sent again.`;
}

/** https only; the platform fetches this URL, so it must be a public web address. */
export function isPublishableImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}
