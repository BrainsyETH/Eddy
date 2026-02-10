'use client';

// src/app/embed/widget/[slug]/page.tsx
// Embeddable widget for displaying river conditions in an iframe

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

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: isDark ? '#1a1a1a' : '#ffffff' }}
      >
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2D7889' }} />
      </div>
    );
  }

  if (!river) {
    return (
      <div
        className="flex items-center justify-center h-screen p-4 text-center"
        style={{ background: isDark ? '#1a1a1a' : '#ffffff', color: isDark ? '#999' : '#666' }}
      >
        <p className="text-sm">River not found</p>
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
        background: isDark ? '#1a1a1a' : '#ffffff',
        color: isDark ? '#e5e5e5' : '#1a1a1a',
        minHeight: '100vh',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <Image src={eddyImage} alt="Eddy" width={48} height={48} style={{ width: 40, height: 40, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px', lineHeight: 1.2 }}>
            {river.name}
          </div>
          <div style={{ fontSize: '12px', color: isDark ? '#888' : '#999', marginTop: '2px' }}>
            {river.lengthMiles} mi &middot; {river.accessPointCount} access points
          </div>
        </div>
      </div>

      {/* Condition Badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '8px',
          backgroundColor: `${conditionColor}18`,
          border: `2px solid ${conditionColor}40`,
          marginBottom: '12px',
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
        <span style={{ fontWeight: 600, fontSize: '14px', color: conditionColor }}>
          {conditionLabel}
        </span>
      </div>

      {/* Link to Eddy */}
      <a
        href={`${origin}/rivers/${river.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: '12px',
          color: '#2D7889',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        View on eddy.guide &rarr;
      </a>
    </div>
  );
}
