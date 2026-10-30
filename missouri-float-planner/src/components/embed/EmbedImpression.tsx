'use client';

// src/components/embed/EmbedImpression.tsx
// Fires one impression beacon per widget load so the embed program is
// measurable (which widgets, which sizes, which rivers/dams, which host
// sites). Mounted next to EmbedAutoResize in each embed layout. Counterpart
// API reduces the referrer to a hostname and aggregates daily — see
// /api/embed/impression and the admin dashboard's "AI & reach" cards.
//
// The family routes pass `sized`: the size rides in the type
// ('river-card', 'dam-strip') so the dashboard can say which sizes get used
// without a schema change. Legacy routes keep their original type names.

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { impressionType, parseEmbedSize, type EmbedKind } from '@/lib/embed/options';

export default function EmbedImpression({ widgetType, sized = false }: { widgetType: string; sized?: boolean }) {
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
      const type = sized
        ? impressionType(widgetType as EmbedKind, parseEmbedSize(searchParams.get('size'), 'card'))
        : widgetType;

      const payload = JSON.stringify({
        widgetType: type,
        widgetKey,
        referrer: document.referrer || '',
        theme: searchParams.get('theme') === 'dark' ? 'dark' : 'light',
        partner: searchParams.get('partner') || searchParams.get('e') || undefined,
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
