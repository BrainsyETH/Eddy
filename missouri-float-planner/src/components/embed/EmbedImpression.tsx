'use client';

// src/components/embed/EmbedImpression.tsx
// Fires one impression beacon per widget load so the embed program is
// measurable (which widgets, which rivers/embeds, which host sites). Mounted
// next to EmbedAutoResize in each embed layout. Counterpart API reduces the
// referrer to a hostname and aggregates daily — see /api/embed/impression.

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function EmbedImpression({ widgetType }: { widgetType: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const segments = pathname.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] || '';
      // Slug-scoped widgets carry their key in the path; the planner and the
      // multi-river overview take it from the query string instead.
      const widgetKey =
        widgetType === 'planner' || widgetType === 'rivers'
          ? searchParams.get('river') || searchParams.get('rivers')?.split(',')[0] || 'none'
          : lastSegment;

      const payload = JSON.stringify({
        widgetType,
        widgetKey,
        referrer: document.referrer || '',
        theme: searchParams.get('theme') === 'dark' ? 'dark' : 'light',
        partner: searchParams.get('partner') || undefined,
      });

      const blob = new Blob([payload], { type: 'application/json' });
      if (!navigator.sendBeacon || !navigator.sendBeacon('/api/embed/impression', blob)) {
        fetch('/api/embed/impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Analytics must never break the widget.
    }
    // Fire exactly once per mount — a widget iframe lives for one page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
