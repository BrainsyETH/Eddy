'use client';

// src/components/AnalyticsListener.tsx
// Delegated click tracking: any element with a `data-ga-event` attribute fires
// a GA4 event when clicked (with an optional `data-ga-label`). This lets
// server-rendered links opt into analytics with plain attributes — no per-link
// client handlers. Mounted once in the root layout; renders nothing.

import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function AnalyticsListener() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const start = e.target as Element | null;
      const el = start?.closest?.('[data-ga-event]') as HTMLElement | null;
      if (!el) return;
      const action = el.dataset.gaEvent;
      if (!action) return;
      const label = el.dataset.gaLabel;
      trackEvent(action, label ? { label } : undefined);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
