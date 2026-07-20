// src/lib/social/tiktok-client.ts
// Low-level TikTok Content Posting API client (draft / inbox-upload mode).
//
// Unlike Meta (a static Page token in env), TikTok uses OAuth2: a ~24h access
// token and a ~365d refresh token that ROTATES on every refresh and must be
// persisted. Tokens live in the `social_tokens` table (00165), read/written
// only via the service-role client. App-level creds (client key/secret) are env.
//
// v1 posts as DRAFT: the reel is uploaded to the creator's TikTok inbox and the
// creator finishes/captions the post in-app. This needs only the `video.upload`
// scope and no app audit. Direct public posting is a future phase.

const TIKTOK_OAUTH_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_INBOX_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
// Direct-post (auto-publish) endpoints — used only in direct mode (audited apps).
const TIKTOK_CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
const TIKTOK_DIRECT_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';

// Draft (inbox) mode needs only `video.upload` and no app audit. Direct-post
// mode (auto-publish to the profile, caption included) needs `video.publish`,
// granted only after the TikTok app audit. Toggle with TIKTOK_DIRECT_POST=true
// AFTER the audit — enabling it before video.publish is granted makes the OAuth
// connect fail with unauthorized_client.
export const TIKTOK_DRAFT_SCOPES = 'video.upload';
export const TIKTOK_DIRECT_SCOPES = 'video.upload,video.publish';

/** True when reels should publish directly to the profile instead of landing as
 *  inbox drafts. Requires an audited app + the video.publish scope. */
export function isTikTokDirectPost(): boolean {
  return process.env.TIKTOK_DIRECT_POST === 'true';
}

/** OAuth scope string to request, based on the active posting mode. */
export function tiktokScopes(): string {
  return isTikTokDirectPost() ? TIKTOK_DIRECT_SCOPES : TIKTOK_DRAFT_SCOPES;
}

// CSRF state cookie for the OAuth round-trip. Set by the (admin-gated) connect
// route and verified by the public callback route (which TikTok reaches via a
// browser redirect with no admin bearer, so it can't live under /api/admin).
export const TIKTOK_STATE_COOKIE = 'tiktok_oauth_state';

// Refresh the access token this many ms before it actually expires, so a token
// that is about to lapse mid-request is renewed first.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = any;

interface TikTokAppCreds {
  clientKey?: string;
  clientSecret?: string;
  redirectUri?: string;
}

// The OAuth callback is always served at this fixed PUBLIC path. It lives
// outside /api/admin on purpose — middleware Bearer-gates everything under
// /api/admin, and TikTok reaches the callback via a browser redirect with no
// admin token.
export const TIKTOK_CALLBACK_PATH = '/api/social/tiktok/callback';

/**
 * Resolve the exact redirect_uri to hand TikTok. This value MUST be
 * byte-identical between the authorize step and the code exchange, and MUST
 * exactly match a redirect URI registered on the TikTok app — otherwise TikTok
 * fails the flow with a "redirect_uri" error. So we derive it deterministically:
 * keep the ORIGIN from TIKTOK_REDIRECT_URI (or NEXT_PUBLIC_SITE_URL, or the prod
 * default) but always force the canonical callback path. This self-heals the two
 * misconfigurations that most often trigger that error — a stale
 * `/api/admin/social/tiktok/callback` path (where the callback used to live
 * before it was moved out of the Bearer-gated tree) and a trailing slash.
 */
export function resolveTikTokRedirectUri(): string {
  const raw = (
    process.env.TIKTOK_REDIRECT_URI ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://eddy.guide'
  ).trim();
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    // Not a full URL (e.g. "eddy.guide") — coerce the host into an https origin.
    origin = `https://${raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`;
  }
  return `${origin}${TIKTOK_CALLBACK_PATH}`;
}

function getAppCreds(): TikTokAppCreds {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    // Always the canonical callback URL, regardless of the path in env — see
    // resolveTikTokRedirectUri. authorize + code-exchange therefore always agree.
    redirectUri: resolveTikTokRedirectUri(),
  };
}

/** App-level credential presence (client key + secret). A connected account
 *  (a row in social_tokens) is checked separately at publish time. */
export function hasTikTokCredentials(): boolean {
  const { clientKey, clientSecret } = getAppCreds();
  return Boolean(clientKey && clientSecret);
}

interface TikTokTokenRow {
  open_id: string | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  scope: string | null;
}

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

/** Build the Login-Kit authorize URL the admin visits to grant access. */
export function buildAuthorizeUrl(state: string): string {
  const { clientKey, redirectUri } = getAppCreds();
  const params = new URLSearchParams({
    client_key: clientKey || '',
    scope: tiktokScopes(),
    response_type: 'code',
    redirect_uri: redirectUri || '',
    state,
  });
  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

/** POST the OAuth token endpoint (used for both code-exchange and refresh). */
async function postToken(body: Record<string, string>): Promise<TikTokTokenResponse> {
  const res = await fetch(TIKTOK_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json()) as TikTokTokenResponse;
  if (!res.ok || data.error) {
    throw new Error(`TikTok token error: ${data.error || res.status} ${data.error_description || ''}`.trim());
  }
  return data;
}

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/** Persist a token response into the single social_tokens row for TikTok. */
async function saveTokens(supabase: Supabase, t: TikTokTokenResponse): Promise<void> {
  const { error } = await supabase.from('social_tokens').upsert(
    {
      platform: 'tiktok',
      open_id: t.open_id,
      access_token: t.access_token,
      access_token_expires_at: expiresAt(t.expires_in),
      refresh_token: t.refresh_token,
      refresh_token_expires_at: expiresAt(t.refresh_expires_in),
      scope: t.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform' },
  );
  if (error) throw new Error(`Failed to persist TikTok tokens: ${error.message}`);
}

/** Exchange an authorization code for tokens and store them (OAuth callback). */
export async function exchangeCodeForTokens(supabase: Supabase, code: string): Promise<void> {
  const { clientKey, clientSecret, redirectUri } = getAppCreds();
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('TikTok app credentials are not configured');
  }
  const tokens = await postToken({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  await saveTokens(supabase, tokens);
}

/** Return a valid access token, refreshing (and persisting the rotated refresh
 *  token) if the stored one is expired or about to expire. Null when TikTok is
 *  not connected (no token row) or app creds are missing. */
export async function getValidAccessToken(supabase: Supabase): Promise<string | null> {
  const { clientKey, clientSecret } = getAppCreds();
  if (!clientKey || !clientSecret) return null;

  const { data: row } = await supabase
    .from('social_tokens')
    .select('open_id, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at, scope')
    .eq('platform', 'tiktok')
    .maybeSingle();
  const token = row as TikTokTokenRow | null;
  if (!token) return null;

  const accessExpiryMs = new Date(token.access_token_expires_at).getTime();
  if (Date.now() < accessExpiryMs - REFRESH_SKEW_MS) {
    return token.access_token;
  }

  // Access token expired/expiring — refresh. If the refresh token itself has
  // lapsed (365d), the account must be reconnected via OAuth.
  if (Date.now() >= new Date(token.refresh_token_expires_at).getTime()) {
    throw new Error('TikTok refresh token expired — reconnect the account');
  }
  const refreshed = await postToken({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
  });
  // The returned refresh_token may differ — saveTokens persists the new one.
  await saveTokens(supabase, refreshed);
  return refreshed.access_token;
}

/** True when TikTok is actually connected (a token row exists). Async — used by
 *  getEnabledPlatforms to gate the fan-out on a live connection. */
export async function isTikTokConnected(supabase: Supabase): Promise<boolean> {
  if (!hasTikTokCredentials()) return false;
  const { data } = await supabase.from('social_tokens').select('platform').eq('platform', 'tiktok').maybeSingle();
  return Boolean(data);
}

interface InboxInitResponse {
  data?: { publish_id?: string; upload_url?: string };
  error?: { code?: string; message?: string };
}

/**
 * Upload a rendered reel to the creator's TikTok inbox as a DRAFT.
 * Flow: get token → download the mp4 from its public URL → init a single-chunk
 * FILE_UPLOAD → PUT the bytes. TikTok delivers it to the creator's inbox; they
 * finish + caption the post in-app (draft mode carries no title/caption).
 */
export async function publishVideoToTikTok(
  params: { videoUrl: string },
  supabase: Supabase,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const accessToken = await getValidAccessToken(supabase);
    if (!accessToken) {
      return { success: false, error: 'TikTok is not connected (no stored token) — connect the account first' };
    }

    // Download the reel from its public blob URL (server-side; FILE_UPLOAD
    // avoids TikTok's PULL_FROM_URL domain-verification requirement).
    const videoRes = await fetch(params.videoUrl);
    if (!videoRes.ok) {
      return { success: false, error: `Failed to fetch video (${videoRes.status}) from ${params.videoUrl}` };
    }
    const bytes = Buffer.from(await videoRes.arrayBuffer());
    const size = bytes.byteLength;
    if (size === 0) return { success: false, error: 'Fetched video was empty' };

    // Init: single chunk (files are ~1.7MB, well under TikTok's per-chunk max).
    const initRes = await fetch(TIKTOK_INBOX_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: size,
          total_chunk_count: 1,
        },
      }),
    });
    const initData = (await initRes.json()) as InboxInitResponse;
    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;
    // TikTok wraps every response in an `error` object with code 'ok' on success.
    const apiErrOk = !initData.error?.code || initData.error.code === 'ok';
    if (!initRes.ok || !apiErrOk || !uploadUrl || !publishId) {
      return {
        success: false,
        error: `TikTok init failed: ${initData.error?.message || initData.error?.code || initRes.status}`,
      };
    }

    // PUT the whole file as one chunk.
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(size),
        'Content-Range': `bytes 0-${size - 1}/${size}`,
      },
      body: bytes,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      return { success: false, error: `TikTok upload PUT failed (${putRes.status}): ${text.slice(0, 200)}` };
    }

    // Success — the draft is now in the creator's TikTok inbox. publish_id is
    // stored as the platform_post_id for traceability.
    return { success: true, postId: publishId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown TikTok error' };
  }
}

interface CreatorInfoResponse {
  data?: { privacy_level_options?: string[] };
  error?: { code?: string; message?: string };
}

/**
 * Publish a reel DIRECTLY to the connected profile (audited apps, video.publish).
 * Unlike the draft flow this sends the caption as the post title and publishes
 * with no manual in-app step — full parity with the FB/IG auto-publish.
 *
 * TikTok requires querying creator_info first to learn which privacy levels the
 * creator allows: an UNAUDITED client is forced to SELF_ONLY (private), so we
 * pick TIKTOK_PRIVACY_LEVEL (default PUBLIC_TO_EVERYONE) when it's allowed and
 * otherwise fall back to the most permissive option the creator actually offers.
 */
export async function publishVideoToTikTokDirect(
  params: { videoUrl: string; caption?: string },
  supabase: Supabase,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const accessToken = await getValidAccessToken(supabase);
    if (!accessToken) {
      return { success: false, error: 'TikTok is not connected (no stored token) — connect the account first' };
    }

    // 1. creator_info → the privacy levels this creator/app state permits.
    const ciRes = await fetch(TIKTOK_CREATOR_INFO_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    });
    const ciData = (await ciRes.json()) as CreatorInfoResponse;
    const ciErrOk = !ciData.error?.code || ciData.error.code === 'ok';
    const options = ciData.data?.privacy_level_options ?? [];
    if (!ciRes.ok || !ciErrOk || options.length === 0) {
      return {
        success: false,
        error: `TikTok creator_info failed: ${ciData.error?.message || ciData.error?.code || ciRes.status}`,
      };
    }
    const preferred = process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE';
    const privacyLevel = options.includes(preferred) ? preferred : options[0];

    // 2. Download the reel bytes (FILE_UPLOAD — no PULL_FROM_URL verification).
    const videoRes = await fetch(params.videoUrl);
    if (!videoRes.ok) {
      return { success: false, error: `Failed to fetch video (${videoRes.status}) from ${params.videoUrl}` };
    }
    const bytes = Buffer.from(await videoRes.arrayBuffer());
    const size = bytes.byteLength;
    if (size === 0) return { success: false, error: 'Fetched video was empty' };

    // 3. Init the direct post — the caption rides along as the title.
    const initRes = await fetch(TIKTOK_DIRECT_INIT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: {
          // TikTok titles cap at 2200 UTF-16 code units; #hashtags in the text
          // are parsed by TikTok.
          title: (params.caption || '').slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    });
    const initData = (await initRes.json()) as InboxInitResponse;
    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;
    const apiErrOk = !initData.error?.code || initData.error.code === 'ok';
    if (!initRes.ok || !apiErrOk || !uploadUrl || !publishId) {
      return {
        success: false,
        error: `TikTok direct init failed: ${initData.error?.message || initData.error?.code || initRes.status}`,
      };
    }

    // 4. PUT the whole file as one chunk (same upload as the draft flow).
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(size),
        'Content-Range': `bytes 0-${size - 1}/${size}`,
      },
      body: bytes,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      return { success: false, error: `TikTok direct upload PUT failed (${putRes.status}): ${text.slice(0, 200)}` };
    }

    // publish_id is stored as platform_post_id for traceability.
    return { success: true, postId: publishId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown TikTok error' };
  }
}
