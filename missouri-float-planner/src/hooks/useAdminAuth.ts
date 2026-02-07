'use client';

// src/hooks/useAdminAuth.ts
// Admin authentication hook — validates credentials server-side
// and stores the returned API token for subsequent requests.

import { useState, useEffect, useCallback } from 'react';

const ADMIN_TOKEN_KEY = 'mfp_admin_token';

export function useAdminAuth() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if we already have a stored token
    const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (stored) {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
    }
  }, []);

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
        setError(data.error || 'Invalid password');
        return;
      }

      const data = await response.json();
      if (data.token) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setIsAuthorized(true);
        setPassword('');
      }
    } catch {
      setError('Network error — please try again');
    }
  };

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
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
