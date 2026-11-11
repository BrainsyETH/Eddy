'use client';
import { useEffect, useState } from 'react';
import { useAdminAuth } from './useAdminAuth';
export function useAdminDraft<T>(
  name: string,
  value: T | null,
  dirty: boolean,
) {
  const { identity } = useAdminAuth();
  const key = `eddy-admin-draft:${identity?.id ?? 'recovery'}:${name}`;
  const [recovered, setRecovered] = useState<T | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setRecovered(JSON.parse(raw));
    } catch {
      /* Storage unavailable: navigation guard still protects this page. */
    }
  }, [key]);
  useEffect(() => {
    if (!dirty || !value) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Leave the current form intact. */
    }
  }, [key, dirty, value]);
  const clear = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
    setRecovered(null);
  };
  return { recovered, clear };
}
