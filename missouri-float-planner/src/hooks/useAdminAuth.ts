'use client';

// src/hooks/useAdminAuth.ts
// Admin authentication hook — validates credentials server-side and relies on
// an HttpOnly cookie that browser JavaScript cannot read.

import { useState, useEffect, useCallback } from 'react';

// Dispatched when an admin API call is rejected with 401, so AdminLayout can
// drop back to the login screen instead of leaving the page stuck on a raw
// "Unauthorized" error with a token the server no longer accepts.
const ADMIN_AUTH_EXPIRED_EVENT = 'admin-auth-expired';

export function useAdminAuth() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/session', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => {
        if (active) setIsAuthorized(response.ok);
      })
      .catch(() => {
        if (active) setIsAuthorized(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // When any admin API call 401s, adminFetch clears the token and fires this
  // event — flip straight to the login screen so the user can re-auth.
  useEffect(() => {
    function handleExpired() {
      setIsAuthorized(false);
      setPassword('');
    }
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Validate password on the server — password is NEVER in client JS bundle
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 429) {
          setError('Too many login attempts. Please wait and try again.');
        } else {
          setError(data.error || 'Invalid password');
        }
        return;
      }

      setIsAuthorized(true);
      setPassword('');
    } catch {
      setError('Network error — please try again');
    }
  };

  const logout = useCallback(async () => {
    await fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => undefined);
    setIsAuthorized(false);
    setPassword('');
  }, []);

  return {
    isAuthorized,
    password,
    setPassword,
    error,
    handleSubmit,
    logout,
  };
}

/**
 * Wrapper for authenticated admin requests. The browser attaches the HttpOnly
 * same-origin session cookie; no credential is accessible to client code.
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  // Admin data must never come from the browser cache: a river or access point
  // created since the tab loaded has to appear on the next fetch, not after a
  // hard refresh. (This is why newly-added rivers were invisible in the
  // geography editor's river list.)
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers,
  });

  // Auto-recover from a rejected token (expired session, or a token signed with
  // a rotated/other-environment secret): drop it and signal AdminLayout to show
  // the login screen. Without this the caller just renders "Unauthorized"
  // forever while re-sending the same dead token on every retry.
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_AUTH_EXPIRED_EVENT));
  }

  return response;
}
