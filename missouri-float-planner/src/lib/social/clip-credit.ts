// src/lib/social/clip-credit.ts
//
// How a reposted clip credits — and, where it can, TAGS — its original creator.
//
// clip_library.source_creator is written by render-clip.yml from the pipeline's
// creator credit, which scripts/clipengine/resolve-credit.py builds by one rule
// on both the local runner and the cloud scan: the creator's Instagram handle
// (from clipengine-local/channels.json) with a leading "@", else the bare
// YouTube channel name. So a leading "@" here means "an Instagram account we
// know", and it is the only thing this module ever puts an "@" in front of. An
// @mention in an Instagram caption tags whichever account owns that handle, so
// a YouTube handle guessed into an "@" would tag a stranger — the channel name
// is written out instead.

export interface ClipSource {
  source_creator: string | null;
  youtube_channel?: string | null;
}

/** The caption's closing call to action — the full line the button abbreviates. */
export const CLIP_CAPTION_CTA = 'Download the Eddy River Guide on iOS';

/** "@handle" when the credit is a known Instagram account, else null. */
export function clipCreditHandle(clip: ClipSource): string | null {
  const raw = (clip.source_creator || '').trim();
  if (!raw.startsWith('@')) return null;
  const handle = raw.replace(/^@+/, '');
  // Instagram usernames: letters, digits, periods, underscores, ≤30 chars.
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : null;
}

/** The creator's name as written out when there is no handle to tag. */
function clipChannelName(clip: ClipSource): string {
  const creator = (clip.source_creator || '').trim();
  if (creator && !creator.startsWith('@')) return creator;
  return (clip.youtube_channel || '').trim();
}

/**
 * The credit line every clip caption carries: "🎥 Clip via @handle" (an
 * Instagram mention, so the post tags the creator) or, with no known handle,
 * "🎥 Clip via <channel> on YouTube". Null when nothing is known at all.
 */
export function clipCreditLine(clip: ClipSource): string | null {
  const handle = clipCreditHandle(clip);
  if (handle) return `🎥 Clip via ${handle}`;
  const channel = clipChannelName(clip);
  return channel ? `🎥 Clip via ${channel} on YouTube` : null;
}

/**
 * True when the caption carries the canonical credit line itself — not merely
 * the creator's name somewhere in the prose. "Thanks @creator" is a mention,
 * but it is not the attribution the pipeline promised, so it does not count.
 */
export function captionCreditsClip(caption: string, clip: ClipSource): boolean {
  const line = clipCreditLine(clip);
  return line !== null && caption.toLowerCase().includes(line.toLowerCase());
}

/** A line that is (a variant of) the CTA — matched so it can be moved last. */
function isCtaLine(line: string): boolean {
  return /download the eddy river guide/i.test(line);
}

/**
 * The caption body in its promised shape: prose, then the canonical credit
 * line, then the CTA as the LAST line. The model is asked for exactly this
 * order and to keep both lines verbatim; this is the backstop for a draft that
 * dropped the credit, reworded the CTA, or put the CTA before the credit.
 * Any CTA line the draft already carries is lifted out and re-appended, so
 * restoring the credit can never bury the CTA.
 */
export function finalizeClipBody(body: string, clip: ClipSource): string {
  const kept = body
    .split('\n')
    .filter((line) => !isCtaLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const credit = clipCreditLine(clip);
  const withCredit = credit && !captionCreditsClip(kept, clip) ? `${kept}\n\n${credit}` : kept;
  return `${withCredit}\n${CLIP_CAPTION_CTA}`;
}

/** The caption body (no hashtag block yet) plus the hashtags to post with it. */
export interface ClipCaptionDraft {
  body: string;
  hashtags: string[];
}

/**
 * The deterministic clip caption — the template the poster falls back to when
 * there is no model, and the shape the model is asked to match.
 *
 * Tier 1 = a known Eddy river (river name + targeted hashtag). Tier 2 = good
 * paddling content with no known river (generic "Ozark paddling" header + no
 * river/Missouri hashtag, since the clip may be out of state). Pass a
 * null/empty riverName for Tier 2. Both tiers credit the creator — tagging
 * their Instagram when it is known — and end on the app download CTA.
 */
export function buildClipCaption(riverName: string | null, clip: ClipSource): ClipCaptionDraft {
  const hasRiver = !!(riverName && riverName.trim());
  const body = finalizeClipBody(hasRiver ? `🛶 ${riverName}.` : '🛶 Ozark paddling.', clip);
  const hashtags = hasRiver
    ? ['#' + riverName!.replace(/[^A-Za-z0-9]/g, ''), '#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#Missouri', '#eddyguide']
    : ['#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#eddyguide'];
  return { body, hashtags };
}

/**
 * The caption that is actually posted: the finalized body, then the hashtag
 * block — unless the body already carries hashtags inline.
 */
export function assembleClipCaption(body: string, hashtags: string[]): string {
  const parts = [body.trim()];
  if (hashtags.length && !/#\w/.test(body)) parts.push(hashtags.join(' '));
  return parts.join('\n\n');
}
