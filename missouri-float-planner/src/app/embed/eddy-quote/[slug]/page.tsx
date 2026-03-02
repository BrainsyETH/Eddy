'use client';

// src/app/embed/eddy-quote/[slug]/page.tsx
// Embeddable Eddy AI quote widget for external sites.
// Shows the AI-generated condition update with Eddy mascot, condition badge, and
// links back to the full river page. Falls back to static quote when no AI update exists.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { RIVER_KNOWLEDGE, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';

interface EddyUpdate {
  quoteText: string;
  conditionCode: string;
  gaugeHeightFt: number | null;
  generatedAt: string;
}

interface RiverBasic {
  name: string;
  slug: string;
  currentCondition?: { code: ConditionCode; label: string } | null;
}

const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  canoe: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png',
};

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

const CONDITION_COLORS: Record<string, string> = {
  optimal: '#059669',
  okay: '#65a30d',
  low: '#d97706',
  too_low: '#9ca3af',
  high: '#ea580c',
  dangerous: '#dc2626',
  unknown: '#9ca3af',
};

function getEddyImage(code?: string | null): string {
  if (!code) return EDDY_IMAGES.flag;
  switch (code) {
    case 'optimal':
    case 'okay':
      return EDDY_IMAGES.canoe;
    case 'high':
    case 'dangerous':
      return EDDY_IMAGES.red;
    case 'low':
      return EDDY_IMAGES.yellow;
    case 'too_low':
      return EDDY_IMAGES.flag;
    default:
      return EDDY_IMAGES.flag;
  }
}

function getConditionLabel(code: string): string {
  const labels: Record<string, string> = {
    optimal: 'Optimal',
    okay: 'Okay',
    low: 'Low',
    too_low: 'Too Low',
    high: 'High',
    dangerous: 'Flood',
    unknown: 'Unknown',
  };
  return labels[code] || 'Unknown';
}

function formatAge(generatedAt: string): string {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 'Updated just now';
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export default function EddyQuoteEmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const isDark = theme === 'dark';

  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eddyRes, riversRes] = await Promise.all([
          fetch(`/api/eddy-update/${slug}`),
          fetch('/api/rivers'),
        ]);

        if (riversRes.ok) {
          const data = await riversRes.json();
          const found = data.rivers?.find((r: RiverBasic) => r.slug === slug);
          if (found) setRiver(found);
        }

        if (eddyRes.ok) {
          const data = await eddyRes.json();
          if (data.available && data.update) {
            setUpdate(data.update);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // Determine what to display
  const conditionCode = update?.conditionCode || river?.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[conditionCode] || CONDITION_COLORS.unknown;
  const eddyImage = getEddyImage(conditionCode);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  // Build fallback text if no AI update
  const quoteText = update?.quoteText || (() => {
    const knowledge = RIVER_KNOWLEDGE[slug];
    const blurb = CONDITION_CARD_BLURBS[conditionCode as ConditionCode] || CONDITION_CARD_BLURBS.unknown;
    const parts: string[] = [];
    if (update?.gaugeHeightFt != null) {
      parts.push(`Reading ${update.gaugeHeightFt.toFixed(1)} ft at the gauge.`);
    }
    parts.push(blurb);
    if (knowledge) {
      parts.push(`Optimal range is ${knowledge.optimalRange}. ${knowledge.notes}`);
    }
    return parts.join(' ');
  })();

  // Theme colors
  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const quoteBg = isDark ? '#1f2d20' : '#f0fdf4';
  const quoteBorder = isDark ? '#2d4a2e' : '#bbf7d0';
  const quoteText_ = isDark ? '#a7f3d0' : '#065f46';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: bg }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River not found
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
      }}
    >
      {/* Header: River name + condition badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={eddyImage}
          alt="Eddy"
          width={48}
          height={48}
          style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {river.name}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
            Eddy says
          </div>
        </div>
        {/* Condition pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: `${conditionColor}15`,
            border: `1.5px solid ${conditionColor}35`,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: conditionColor, whiteSpace: 'nowrap' }}>
            {getConditionLabel(conditionCode)}
          </span>
        </div>
      </div>

      {/* Quote text */}
      <div
        style={{
          background: quoteBg,
          border: `1.5px solid ${quoteBorder}`,
          borderRadius: 10,
          padding: '10px 14px',
        }}
      >
        <p style={{ fontSize: 13, lineHeight: 1.5, color: quoteText_, margin: 0, fontWeight: 500 }}>
          &ldquo;{quoteText}&rdquo;
        </p>
        {update?.generatedAt && (
          <div style={{ fontSize: 10, color: textSecondary, marginTop: 6 }}>
            {formatAge(update.generatedAt)}
          </div>
        )}
      </div>

      {/* Footer: Links */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 8,
          marginTop: 2,
        }}
      >
        <a
          href={`${origin}/rivers/${river.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
        >
          Full conditions &rarr;
        </a>
        <a
          href={origin}
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
