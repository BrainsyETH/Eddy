'use client';

// src/hooks/useAdminAuth.ts
// Admin authentication hook — validates credentials server-side
// and stores the returned time-limited API token for subsequent requests.

import { useState, useEffect, useCallback } from 'react';

const ADMIN_TOKEN_KEY = 'mfp_admin_token';
const ADMIN_TOKEN_EXPIRY_KEY = 'mfp_admin_token_expiry';

// Dispatched when an admin API call is rejected with 401, so AdminLayout can
// drop back to the login screen instead of leaving the page stuck on a raw
// "Unauthorized" error with a token the server no longer accepts.
const ADMIN_AUTH_EXPIRED_EVENT = 'admin-auth-expired';

function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
}

/**
 * Check if the stored token is still valid (not expired).
 */
function isTokenValid(): boolean {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const expiry = sessionStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);
  if (!token) return false;
  if (expiry) {
    const expiresAt = parseInt(expiry, 10);
    if (!isNaN(expiresAt) && Date.now() > expiresAt) {
      // Token expired — clean up
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
      return false;
    }
  }
  return true;
}

export function useAdminAuth() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setIsAuthorized(isTokenValid());
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

  // Auto-logout when token expires
  useEffect(() => {
    if (!isAuthorized) return;
    const expiry = sessionStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);
    if (!expiry) return;

    const expiresAt = parseInt(expiry, 10);
    if (isNaN(expiresAt)) return;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setIsAuthorized(false);
      return;
    }

    const timer = setTimeout(() => {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
      setIsAuthorized(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [isAuthorized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Validate password on the server — password is NEVER in client JS bundle
      const response = await fetch('/api/admin/login', {
        method: 'POST',
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

      const data = await response.json();
      if (data.token) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        if (data.expiresIn) {
          const expiresAt = Date.now() + data.expiresIn * 1000;
          sessionStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, String(expiresAt));
        }
        setIsAuthorized(true);
        setPassword('');
      }
    } catch {
      setError('Network error — please try again');
    }
  };

  const logout = useCallback(() => {
    clearAdminToken();
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
 * Returns the stored admin API token, or null if not authenticated.
 * Use this to add Authorization headers to admin API requests.
 */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (!isTokenValid()) return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Wrapper for fetch that automatically adds the admin Authorization header.
 * Falls back to regular fetch if no token is available.
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Admin data must never come from the browser cache: a river or access point
  // created since the tab loaded has to appear on the next fetch, not after a
  // hard refresh. (This is why newly-added rivers were invisible in the
  // geography editor's river list.)
  const response = await fetch(url, { cache: 'no-store', ...options, headers });

  // Auto-recover from a rejected token (expired session, or a token signed with
  // a rotated/other-environment secret): drop it and signal AdminLayout to show
  // the login screen. Without this the caller just renders "Unauthorized"
  // forever while re-sending the same dead token on every retry.
  if (response.status === 401 && typeof window !== 'undefined') {
    clearAdminToken();
    window.dispatchEvent(new Event(ADMIN_AUTH_EXPIRED_EVENT));
  }

  return response;
}
