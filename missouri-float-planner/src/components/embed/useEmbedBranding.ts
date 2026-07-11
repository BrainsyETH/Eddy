'use client';

// src/components/embed/useEmbedBranding.ts
// Reads the ?e=<embedId> co-branding param and fetches the partner's public
// branding (logo, name, accent, backlink). Widgets fall back to the plain
// ?partner= text credit when no registration is present or the fetch fails.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmbedBranding } from '@/lib/embed/branding';

const EMBED_ID_RE = /^emb_[0-9a-f]{8}$/;

export function useEmbedBranding(): { embedId: string | null; branding: EmbedBranding | null } {
  const searchParams = useSearchParams();
  const raw = searchParams.get('e') || '';
  const embedId = EMBED_ID_RE.test(raw) ? raw : null;
  const [branding, setBranding] = useState<EmbedBranding | null>(null);

  useEffect(() => {
    if (!embedId) return;
    let cancelled = false;
    fetch(`/api/embed/widgets/${embedId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.branding) setBranding(data.branding as EmbedBranding);
      })
      .catch(() => {}); // co-branding is progressive enhancement — never break the widget
    return () => { cancelled = true; };
  }, [embedId]);

  return { embedId, branding };
}
