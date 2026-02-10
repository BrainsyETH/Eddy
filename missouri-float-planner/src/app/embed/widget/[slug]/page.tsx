'use client';

// src/app/embed/widget/[slug]/page.tsx
// Embeddable widget for displaying river conditions in an iframe
// Designed to be lightweight and self-contained for external sites

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode, RiverListItem } from '@/types/api';

const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

function getEddyImage(code?: ConditionCode | null): string {
  if (!code) return EDDY_IMAGES.flag;
  switch (code) {
    case 'optimal':
    case 'low':
      return EDDY_IMAGES.green;
    case 'high':
    case 'dangerous':
      return EDDY_IMAGES.red;
    case 'very_low':
      return EDDY_IMAGES.yellow;
    default:
      return EDDY_IMAGES.flag;
  }
}

export default function EmbedWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const isDark = theme === 'dark';

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRiver() {
      try {
        const res = await fetch('/api/rivers');
        if (res.ok) {
          const data = await res.json();
          const found = data.rivers?.find((r: RiverListItem) => r.slug === slug);
          setRiver(found || null);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchRiver();
  }, [slug]);

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: bg }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid #2D7889',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River not found
      </div>
    );
  }

  const conditionCode = river.currentCondition?.code;
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
  const conditionLabel = conditionCode ? CONDITION_LABELS[conditionCode] : 'Unknown';
  const eddyImage = getEddyImage(conditionCode);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        height: '100vh',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      {/* Top: River name + Eddy mascot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={eddyImage}
          alt="Eddy"
          width={44}
          height={44}
          style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {river.name}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
            {river.lengthMiles} mi &middot; {river.accessPointCount} access points
          </div>
        </div>
      </div>

      {/* Middle: Condition badge */}
      <div style={{ margin: '10px 0' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderRadius: 8,
            backgroundColor: `${conditionColor}15`,
            border: `2px solid ${conditionColor}35`,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: conditionColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 13, color: conditionColor }}>
            {conditionLabel}
          </span>
        </div>
      </div>

      {/* Bottom: Powered by link */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 10,
        }}
      >
        <a
          href={`${origin}/rivers/${river.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: '#2D7889',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          View full details &rarr;
        </a>
        <a
          href={origin || 'https://eddy.guide'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: textSecondary,
            textDecoration: 'none',
          }}
        >
          <Image
            src={EDDY_LOGO}
            alt="Eddy"
            width={16}
            height={16}
            style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
          />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
