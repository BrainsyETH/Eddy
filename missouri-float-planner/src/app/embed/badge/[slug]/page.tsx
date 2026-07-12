'use client';

// src/app/embed/badge/[slug]/page.tsx
// Embeddable live condition badge — tiny widget showing river name and live condition dot.
// Replaces the static HTML badge with a live-updating iframe version.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { eddyDeepLink } from '@/lib/embed/branding';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

interface RiverBasic {
  name: string;
  slug: string;
  path?: string;
  currentCondition?: { code: string; label: string } | null;
}

export default function EmbedBadgePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const isDark = theme === 'dark';

  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rivers')
      .then(r => r.ok ? r.json() : { rivers: [] })
      .then(data => {
        const found = data.rivers?.find((r: RiverBasic) => r.slug === slug);
        if (found) setRiver(found);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const palette = embedPalette(isDark);
  const bg = palette.bg;
  const textColor = palette.textPrimary;
  const border = palette.border;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  if (loading) {
    return <div style={{ height: 36, background: bg }} />;
  }

  if (!river) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 36,
        padding: '0 14px',
        background: bg,
        color: palette.textSecondary,
        border: `1.5px solid ${border}`,
        borderRadius: 8,
        fontFamily: EMBED_FONTS.body,
        fontSize: 12,
      }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  const conditionCode = river.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const conditionLabel = CONDITION_SHORT_LABELS[conditionCode] || 'Unknown';

  return (
    // inline-block so EmbedAutoResize reports the pill's exact width and the
    // host iframe hugs it (no dead space on the right).
    <div style={{ background: 'transparent', padding: 0, display: 'inline-block' }}>
      <a
        href={eddyDeepLink(origin, river.path || `/rivers/${river.slug}`, { widget: 'badge', key: slug })}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: bg,
          color: textColor,
          border: `1.5px solid ${border}`,
          borderRadius: 8,
          textDecoration: 'none',
          fontFamily: EMBED_FONTS.body,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: `2px 2px 0 ${palette.shadow}`,
          transition: 'box-shadow 0.15s',
        }}
      >
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={20}
          height={20}
          style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'contain' }}
        />
        {river.name}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontWeight: 700,
          color: conditionColor,
        }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: conditionColor,
          }} />
          {conditionLabel}
        </span>
      </a>
    </div>
  );
}
