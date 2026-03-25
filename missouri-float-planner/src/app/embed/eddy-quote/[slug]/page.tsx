'use client';

// src/app/embed/eddy-quote/[slug]/page.tsx
// Embeddable Eddy AI quote widget for external sites.
// Shows the AI-generated condition update with Eddy mascot, condition badge, and
// links back to the full river page. Falls back to static quote when no AI update exists.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { RIVER_NOTES, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';

interface EddyUpdate {
  quoteText: string;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  generatedAt: string;
}

interface RiverBasic {
  name: string;
  slug: string;
  currentCondition?: { code: ConditionCode; label: string } | null;
}

import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

// Bold yes/no float recommendation (#12)
const FLOAT_RECOMMENDATIONS: Record<string, string> = {
  flowing: 'Great day to float!',
  good: 'Good to go',
  low: 'Proceed with caution',
  too_low: 'Not recommended',
  high: 'Use caution',
  dangerous: 'Do not float',
  unknown: 'Check conditions locally',
};

// Condition-tinted quote backgrounds (#13)
function getQuoteColors(code: string, isDark: boolean): { bg: string; border: string; text: string } {
  switch (code) {
    case 'flowing':
      return isDark
        ? { bg: '#1f2d20', border: '#2d4a2e', text: '#a7f3d0' }
        : { bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46' };
    case 'good':
      return isDark
        ? { bg: '#1f2d1a', border: '#3d5a2e', text: '#bef264' }
        : { bg: '#f7fee7', border: '#d9f99d', text: '#3f6212' };
    case 'low':
      return isDark
        ? { bg: '#2d2a1a', border: '#4a3f1e', text: '#fde68a' }
        : { bg: '#fffbeb', border: '#fde68a', text: '#92400e' };
    case 'too_low':
      return isDark
        ? { bg: '#252525', border: '#3a3a3a', text: '#a0a0a0' }
        : { bg: '#f5f5f5', border: '#d4d4d4', text: '#525252' };
    case 'high':
      return isDark
        ? { bg: '#2d1f1a', border: '#4a2e1e', text: '#fdba74' }
        : { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' };
    case 'dangerous':
      return isDark
        ? { bg: '#2d1a1a', border: '#4a1e1e', text: '#fca5a5' }
        : { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };
    default:
      return isDark
        ? { bg: '#252525', border: '#3a3a3a', text: '#a0a0a0' }
        : { bg: '#f5f5f5', border: '#d4d4d4', text: '#525252' };
  }
}



function getConditionLabel(code: string): string {
  return CONDITION_SHORT_LABELS[code] || 'Unknown';
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
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';

  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [optimalRange, setOptimalRange] = useState<string | null>(null);
  const [gaugeReading, setGaugeReading] = useState<string | null>(null);
  const [gaugeName, setGaugeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eddyRes, riversRes, gaugesRes] = await Promise.all([
          fetch(`/api/eddy-update/${slug}`),
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

        let riverId: string | null = null;
        if (riversRes.ok) {
          const data = await riversRes.json();
          const found = data.rivers?.find((r: RiverBasic) => r.slug === slug);
          if (found) {
            setRiver(found);
            riverId = found.id ?? null;
          }
        }

        if (eddyRes.ok) {
          const data = await eddyRes.json();
          if (data.available && data.update) {
            setUpdate(data.update);
          }
        }

        // Extract optimal range and primary gauge info from gauge thresholds
        if (gaugesRes.ok && riverId) {
          const gaugeData = await gaugesRes.json();
          interface GaugeThreshold { riverId: string; isPrimary: boolean; thresholdUnit?: string; levelOptimalMin?: number | null; levelOptimalMax?: number | null }
          interface GaugeEntry { name: string; gaugeHeightFt: number | null; dischargeCfs: number | null; thresholds?: GaugeThreshold[] | null }
          for (const gauge of (gaugeData.gauges as GaugeEntry[])) {
            const primary = gauge.thresholds?.find((t) => t.riverId === riverId && t.isPrimary);
            if (primary) {
              if (primary.levelOptimalMin != null && primary.levelOptimalMax != null) {
                const unit = primary.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
                setOptimalRange(`${primary.levelOptimalMin}\u2013${primary.levelOptimalMax} ${unit}`);
              }
              // Capture gauge reading and name for subtitle (#14)
              const useCfs = primary.thresholdUnit === 'cfs';
              const val = useCfs ? gauge.dischargeCfs : gauge.gaugeHeightFt;
              if (val !== null) {
                setGaugeReading(useCfs ? `${val.toLocaleString()} cfs` : `${val.toFixed(1)} ft`);
                setGaugeName(gauge.name);
              }
              break;
            }
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
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const quoteColors = getQuoteColors(conditionCode, isDark);
  const recommendation = FLOAT_RECOMMENDATIONS[conditionCode] || FLOAT_RECOMMENDATIONS.unknown;

  // Build fallback text if no AI update
  const quoteText = update?.quoteText || (() => {
    const blurb = CONDITION_CARD_BLURBS[conditionCode as ConditionCode] || CONDITION_CARD_BLURBS.unknown;
    const notes = RIVER_NOTES[slug];
    const parts: string[] = [];
    if (update?.gaugeHeightFt != null) {
      parts.push(`Reading ${update.gaugeHeightFt.toFixed(1)} ft at the gauge.`);
    }
    parts.push(blurb);
    if (optimalRange) parts.push(`Optimal range is ${optimalRange}.`);
    if (notes) parts.push(notes);
    return parts.join(' ');
  })();

  // Theme colors
  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';

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
      {/* Header: Eddy favicon + River name + gauge reading (#14) + condition badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={32}
          height={32}
          style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {river.name}
          </div>
          {/* (#14) Show gauge reading instead of generic "Eddy says" */}
          <div style={{ fontSize: 10, fontWeight: 500, color: textSecondary, marginTop: 2 }}>
            {gaugeReading && gaugeName
              ? `${gaugeReading} at ${gaugeName}`
              : update?.generatedAt
                ? formatAge(update.generatedAt)
                : 'Eddy\u2019s take'}
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
            boxShadow: `0 1px 3px ${conditionColor}15`,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: conditionColor, whiteSpace: 'nowrap' }}>
            {getConditionLabel(conditionCode)}
          </span>
        </div>
      </div>

      {/* Bold float recommendation (#12) */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: conditionColor,
          padding: '0 2px',
        }}
      >
        {recommendation}
      </div>

      {/* Quote text with condition-tinted background (#13) */}
      <div
        style={{
          background: quoteColors.bg,
          border: `1.5px solid ${quoteColors.border}`,
          borderRadius: 10,
          padding: '10px 14px',
          boxShadow: `0 1px 2px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'}`,
        }}
      >
        <p style={{ fontSize: 13, lineHeight: 1.5, color: quoteColors.text, margin: 0, fontWeight: 500 }}>
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
          justifyContent: partner ? 'space-between' : 'space-between',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {partner && (
            <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500 }}>
              via {partner}
            </span>
          )}
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
    </div>
  );
}
