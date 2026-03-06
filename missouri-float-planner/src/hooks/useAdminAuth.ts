'use client';

// src/hooks/useAdminAuth.ts
// Admin authentication hook — validates credentials server-side
// and stores the returned time-limited API token for subsequent requests.

import { useState, useEffect, useCallback } from 'react';

const ADMIN_TOKEN_KEY = 'mfp_admin_token';
const ADMIN_TOKEN_EXPIRY_KEY = 'mfp_admin_token_expiry';

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
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
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
  return fetch(url, { ...options, headers });
}
