// src/lib/social/adapters.ts
// Central platform-adapter factory + enabled-platform resolver.
//
// Replaces the getAdapter body that was copy-pasted across the cron, alert,
// callback, quick-post, publish, retry and clip-poster paths, and the hardcoded
// `['facebook','instagram']` fan-out arrays. One place now knows how to build an
// adapter and which platforms are live.

import type { PlatformAdapter, SocialPlatform } from './types';
import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { TikTokAdapter } from './tiktok-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import { hasTikTokCredentials, isTikTokConnected } from './tiktok-client';

/**
 * Build the adapter for a platform, or null when its credentials are absent.
 * Sync: TikTok's app-level creds are env-based; whether an account is actually
 * connected (a stored token) is checked by the adapter at publish time and by
 * getEnabledPlatforms at fan-out time.
 */
export function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  if (platform === 'tiktok' && hasTikTokCredentials()) return new TikTokAdapter();
  return null;
}

/**
 * The platforms a post should fan out to right now: Facebook/Instagram whenever
 * their Meta creds are present (unchanged from the previous hardcoded arrays),
 * plus TikTok only when an account is actually connected (a social_tokens row).
 * Connecting/disconnecting an account is therefore the TikTok on/off switch —
 * no separate config flag.
 */
export async function getEnabledPlatforms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<SocialPlatform[]> {
  const platforms: SocialPlatform[] = [];
  if (hasMetaCredentials()) platforms.push('facebook');
  if (hasInstagramCredentials()) platforms.push('instagram');
  if (hasTikTokCredentials() && (await isTikTokConnected(supabase))) platforms.push('tiktok');
  return platforms;
}
