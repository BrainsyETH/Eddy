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
// is written out instead, and Facebook (where links are clickable) gets the
// source video's URL so the credit still leads back to the creator.

import { CTA, DOWNLOAD_URL } from '@shared/social-brand';
import type { SocialPlatform } from './types';

export interface ClipSource {
  source_creator: string | null;
  youtube_channel?: string | null;
  source_url?: string | null;
}

/** The caption's call to action: the button copy plus the typeable link. */
export const CLIP_CAPTION_CTA = `${CTA.download} → ${DOWNLOAD_URL}`;

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
 * The clickable link back to the source video — Facebook only. Instagram
 * captions are not clickable, so a URL there is noise under the credit.
 */
export function clipSourceLine(clip: ClipSource, platform: SocialPlatform): string | null {
  if (platform !== 'facebook') return null;
  const url = (clip.source_url || '').trim();
  return /^https?:\/\/\S+$/.test(url) ? `▶️ Full video: ${url}` : null;
}

/** True when the caption already names the creator (handle or channel). */
export function captionCreditsClip(caption: string, clip: ClipSource): boolean {
  const lower = caption.toLowerCase();
  const handle = clipCreditHandle(clip);
  if (handle) return lower.includes(handle.toLowerCase());
  const channel = clipChannelName(clip);
  return channel !== '' && lower.includes(channel.toLowerCase());
}

/**
 * The caption with the credit guaranteed present. The AI is asked to keep the
 * credit line verbatim; this is the backstop for a draft that dropped it.
 */
export function ensureClipCredit(caption: string, clip: ClipSource): string {
  const line = clipCreditLine(clip);
  if (!line || captionCreditsClip(caption, clip)) return caption;
  return `${caption.trimEnd()}\n\n${line}`;
}

/**
 * The caption with the download call to action guaranteed present. Checks for
 * the link, not the words: a draft that mentions the app in passing but never
 * tells people where to get it still needs the line.
 */
export function ensureClipCta(caption: string): string {
  if (caption.toLowerCase().includes(DOWNLOAD_URL.toLowerCase())) return caption;
  return `${caption.trimEnd()}\n\n${CLIP_CAPTION_CTA}`;
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
  const credit = clipCreditLine(clip);
  const lines = [hasRiver ? `🛶 ${riverName}.` : '🛶 Ozark paddling.', ''];
  if (credit) lines.push(credit);
  lines.push(CLIP_CAPTION_CTA);
  const hashtags = hasRiver
    ? ['#' + riverName!.replace(/[^A-Za-z0-9]/g, ''), '#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#Missouri', '#eddyguide']
    : ['#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#eddyguide'];
  return { body: lines.join('\n'), hashtags };
}

/**
 * Assemble the caption that is actually posted to one platform: the body (credit
 * and CTA already guaranteed), the Facebook-only source link, then the hashtag
 * block — unless the body already carries hashtags inline.
 */
export function assembleClipCaption(
  body: string,
  hashtags: string[],
  clip: ClipSource,
  platform: SocialPlatform,
): string {
  const parts = [body.trim()];
  const source = clipSourceLine(clip, platform);
  if (source) parts.push(source);
  if (hashtags.length && !/#\w/.test(body)) parts.push(hashtags.join(' '));
  return parts.join('\n\n');
}
