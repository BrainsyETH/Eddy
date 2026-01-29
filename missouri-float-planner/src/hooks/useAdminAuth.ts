'use client';

// src/hooks/useAdminAuth.ts
// Reusable admin authentication hook

import { useState, useEffect } from 'react';

const ADMIN_STORAGE_KEY = 'mfp_admin_auth';

export function useAdminAuth() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already authorized in this session
    const stored = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (stored === 'true') {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Check against environment variable (set in .env.local)
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

    if (!adminPassword) {
      // No password configured - allow access (dev mode)
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      setIsAuthorized(true);
      return;
    }

    if (password === adminPassword) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      setIsAuthorized(true);
      setError('');
    } else {
      setError('Invalid password');
    }
  };

  const logout = () => {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setIsAuthorized(false);
    setPassword('');
  };

  return {
    isAuthorized,
    password,
    setPassword,
    error,
    handleSubmit,
    logout,
  };
}
