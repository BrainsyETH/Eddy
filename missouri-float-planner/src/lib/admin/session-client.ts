export const ADMIN_AUTH_EXPIRED_EVENT = 'admin-auth-expired';
export const ADMIN_AUTH_RESTORED_EVENT = 'admin-auth-restored';
export const ADMIN_CHANGED_EVENT = 'admin-data-changed';
export const ADMIN_ACCESS_CHANGED_EVENT = 'admin-access-changed';

function waitForSignIn(signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(ADMIN_AUTH_RESTORED_EVENT, restored);
      window.removeEventListener('admin-signed-out', cancelled);
      signal?.removeEventListener('abort', cancelled);
    };
    const restored = () => {
      cleanup();
      resolve();
    };
    const cancelled = () => {
      cleanup();
      reject(
        new Error('Sign in to continue. Your changes have not been saved.'),
      );
    };
    const timer = setTimeout(cancelled, 10 * 60_000);
    window.addEventListener(ADMIN_AUTH_RESTORED_EVENT, restored, {
      once: true,
    });
    window.addEventListener('admin-signed-out', cancelled, { once: true });
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
  });
}

/** A 401 is rejected before any write, so it is safe to retry once after sign-in. */
export async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const request = () =>
    fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: new Headers(options.headers),
    });
  let response = await request();
  if (response.status === 401 && typeof window !== 'undefined') {
    const signedIn = waitForSignIn(options.signal);
    window.dispatchEvent(new Event(ADMIN_AUTH_EXPIRED_EVENT));
    await signedIn;
    response = await request();
  }
  if (response.status === 403 && typeof window !== 'undefined') {
    const data = await response
      .clone()
      .json()
      .catch(() => null);
    // Ordinary forbidden actions (including origin checks) are not sign-outs.
    if (
      data?.reason === 'access-revoked' ||
      data?.reason === 'role-forbidden'
    ) {
      window.dispatchEvent(
        new CustomEvent(ADMIN_ACCESS_CHANGED_EVENT, { detail: data }),
      );
    }
  }
  if (
    response.ok &&
    !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase()) &&
    typeof window !== 'undefined'
  ) {
    window.dispatchEvent(new Event(ADMIN_CHANGED_EVENT));
  }
  if (
    response.headers.get('X-Admin-Audit') === 'unavailable' &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event('admin-audit-warning'));
  return response;
}
