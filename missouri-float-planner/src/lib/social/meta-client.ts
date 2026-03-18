// src/lib/social/meta-client.ts
// Low-level Meta Graph API v21 client for Facebook and Instagram posting

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

function getCredentials() {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const instagramAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;

  return { accessToken, pageId, instagramAccountId };
}

export function hasMetaCredentials(): boolean {
  const { accessToken, pageId } = getCredentials();
  return Boolean(accessToken && pageId);
}

export function hasInstagramCredentials(): boolean {
  const { accessToken, instagramAccountId } = getCredentials();
  return Boolean(accessToken && instagramAccountId);
}

// Publish a photo post to a Facebook Page (without adding to photo album)
// Two-step flow: upload unpublished photo, then create a feed post with it attached.
// This keeps the image visible in the feed but out of the Page's photo album.
export async function publishToFacebook(params: {
  caption: string;
  imageUrl: string;
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  const { accessToken, pageId } = getCredentials();

  if (!accessToken || !pageId) {
    return { success: false, error: 'Missing META_PAGE_ACCESS_TOKEN or META_PAGE_ID' };
  }

  try {
    // Step 1: Upload photo as unpublished (published=false keeps it out of the album)
    // Use form-urlencoded — Graph API is more reliable with this format for /photos
    const photoBody = new URLSearchParams({
      url: params.imageUrl,
      published: 'false',
      temporary: 'true',
      no_story: 'true',
      access_token: accessToken,
    });

    const photoResponse = await fetch(`${META_GRAPH_URL}/${pageId}/photos`, {
      method: 'POST',
      body: photoBody,
    });

    const photoData = await photoResponse.json();

    if (!photoResponse.ok) {
      const apiError = photoData as MetaApiError;
      const errorMsg = apiError.error?.message || `HTTP ${photoResponse.status}`;
      console.error('[MetaClient] Facebook photo upload failed:', errorMsg);

      if (apiError.error?.code === 200 && errorMsg.includes('publish_actions')) {
        console.error(
          '[MetaClient] HINT: This error means META_PAGE_ACCESS_TOKEN is a User token, not a Page token. ' +
          'Get a Page token via: GET /me/accounts?access_token=USER_TOKEN → use the page\'s access_token field.'
        );
      }

      return { success: false, error: errorMsg };
    }

    const photoId = photoData.id;
    if (!photoId) {
      return { success: false, error: 'No photo ID returned from upload' };
    }

    // Step 2: Create a feed post with the unpublished photo attached
    // Use form-urlencoded with indexed array syntax for attached_media
    const feedBody = new URLSearchParams({
      message: params.caption,
      'attached_media[0]': JSON.stringify({ media_fbid: photoId }),
      access_token: accessToken,
    });

    const feedResponse = await fetch(`${META_GRAPH_URL}/${pageId}/feed`, {
      method: 'POST',
      body: feedBody,
    });

    const feedData = await feedResponse.json();

    if (!feedResponse.ok) {
      const apiError = feedData as MetaApiError;
      const errorMsg = apiError.error?.message || `HTTP ${feedResponse.status}`;
      console.error('[MetaClient] Facebook feed post failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true, postId: feedData.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MetaClient] Facebook publish error:', msg);
    return { success: false, error: msg };
  }
}

// Publish a photo post to Instagram (2-step container flow)
export async function publishToInstagram(params: {
  caption: string;
  imageUrl: string;
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  const { accessToken, instagramAccountId } = getCredentials();

  if (!accessToken || !instagramAccountId) {
    return { success: false, error: 'Missing META_PAGE_ACCESS_TOKEN or META_INSTAGRAM_ACCOUNT_ID' };
  }

  try {
    console.log(`[MetaClient] Instagram image_url: ${params.imageUrl}`);

    // Pre-flight: GET the image to warm the CDN cache and verify it's valid.
    // HEAD doesn't populate Vercel's CDN cache, so Meta's crawlers would hit
    // a cold serverless function and timeout. A full GET ensures the image is
    // generated, cached at the edge, and ready for Meta to download instantly.
    try {
      const preflight = await fetch(params.imageUrl);
      const contentType = preflight.headers.get('content-type') || 'unknown';
      const contentLength = preflight.headers.get('content-length') || 'unknown';
      console.log(`[MetaClient] Image preflight: status=${preflight.status}, content-type=${contentType}, size=${contentLength}`);
      if (!preflight.ok) {
        return { success: false, error: `Image URL returned HTTP ${preflight.status}` };
      }
      if (!contentType.startsWith('image/')) {
        return { success: false, error: `Image URL returned content-type: ${contentType} (expected image/*)` };
      }
    } catch (preflightErr) {
      console.error('[MetaClient] Image preflight failed:', preflightErr);
      // Network errors (DNS, timeout) mean the URL is unreachable — abort
      const cause = preflightErr instanceof TypeError ? preflightErr : null;
      if (cause) {
        return { success: false, error: `Image URL unreachable: ${cause.message}` };
      }
    }

    // Step 1: Create media container (Story — image appears in Stories, not feed)
    // Use form-urlencoded body (not JSON, not URL params) — most reliable for Meta Graph API
    // Stories don't display captions; the generated image contains all the info
    const containerBody = new URLSearchParams({
      image_url: params.imageUrl,
      media_type: 'STORIES',
      access_token: accessToken,
    });

    const containerResponse = await fetch(
      `${META_GRAPH_URL}/${instagramAccountId}/media`,
      {
        method: 'POST',
        body: containerBody,
      }
    );

    const containerData = await containerResponse.json();

    if (!containerResponse.ok) {
      const apiError = containerData as MetaApiError;
      const errorMsg = apiError.error?.message || `HTTP ${containerResponse.status}`;
      console.error('[MetaClient] Instagram container creation failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    const containerId = containerData.id;
    if (!containerId) {
      return { success: false, error: 'No container ID returned from Instagram' };
    }

    // Step 2: Wait for container to be ready (poll status)
    const ready = await waitForContainer(containerId, accessToken);
    if (!ready.success) {
      return { success: false, error: ready.error || 'Container not ready' };
    }

    // Step 3: Publish the container
    const publishResponse = await fetch(
      `${META_GRAPH_URL}/${instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    const publishData = await publishResponse.json();

    if (!publishResponse.ok) {
      const apiError = publishData as MetaApiError;
      const errorMsg = apiError.error?.message || `HTTP ${publishResponse.status}`;
      console.error('[MetaClient] Instagram publish failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true, postId: publishData.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MetaClient] Instagram publish error:', msg);
    return { success: false, error: msg };
  }
}

// Poll Instagram container status until ready or timeout
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts = 10,
  delayMs = 3000
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(
        `${META_GRAPH_URL}/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const data = await response.json();

      if (data.status_code === 'FINISHED') {
        return { success: true };
      }

      if (data.status_code === 'ERROR') {
        return { success: false, error: 'Container processing failed' };
      }

      // Still processing — wait and try again
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { success: false, error: 'Container processing timed out' };
}

// Validate that the access token is still valid
export async function validateToken(): Promise<{ valid: boolean; error?: string }> {
  const { accessToken } = getCredentials();

  if (!accessToken) {
    return { valid: false, error: 'No access token configured' };
  }

  try {
    const response = await fetch(
      `${META_GRAPH_URL}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.data?.is_valid) {
      const tokenType = data.data.type;
      if (tokenType && tokenType !== 'PAGE') {
        console.warn(
          `[MetaClient] Token is valid but type is "${tokenType}" (expected "PAGE"). ` +
          'Facebook posting requires a Page Access Token. Get one via GET /me/accounts.'
        );
      }
      return { valid: true };
    }

    return {
      valid: false,
      error: data.data?.error?.message || 'Token is invalid or expired',
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Token validation failed',
    };
  }
}
