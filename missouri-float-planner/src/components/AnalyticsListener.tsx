'use client';

// src/components/AnalyticsListener.tsx
// Delegated click tracking: any element with a `data-ga-event` attribute fires
// a GA4 event when clicked (with an optional `data-ga-label`). This lets
// server-rendered links opt into analytics with plain attributes — no per-link
// client handlers. Mounted once in the root layout; renders nothing.

import { useEffect } from 'react';
import { useAppCampaign } from '@/components/AppLink';
import { APP_STORE } from '@/lib/app-discovery';
import { trackEvent } from '@/lib/analytics';

export default function AnalyticsListener() {
  const campaign = useAppCampaign();
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const start = e.target as Element | null;
      const el = start?.closest?.('[data-ga-event]') as HTMLElement | null;
      if (!el) return;
      const action = el.dataset.gaEvent;
      if (!action) return;
      const label = el.dataset.gaLabel;
      trackEvent(action, {
        ...(label ? { label } : {}),
        ...(action === 'app_store_click' ? {
          page_path: window.location.pathname,
          app_campaign: campaign ?? APP_STORE.campaign ?? 'website_download',
          transport_type: 'beacon',
        } : {}),
      });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [campaign]);

  return null;
}
