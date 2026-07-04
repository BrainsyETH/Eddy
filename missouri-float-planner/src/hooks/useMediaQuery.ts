'use client';

// src/hooks/useMediaQuery.ts
// SSR-safe media query hook. Returns null on the server and during the
// hydration render (no way to know the viewport yet), then the live match
// state. Callers can use the null window to avoid mounting heavyweight
// components (e.g. a second MapLibre instance) for a breakpoint that will
// never be visible.

import { useSyncExternalStore, useCallback } from 'react';

export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null
  );
}
