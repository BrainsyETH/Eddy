// src/app/embed/card/[embedId]/page.tsx
// "Floatable From Here" — the location-pinned embed card.
//
// Server-rendered: the embedder's pin, launch point, and drive time were
// resolved once at install (embed_widgets row); only the live condition for
// the reach nearest their launch is computed per render. No client fetch
// waterfall — the host page gets finished HTML.
//
// Embedder-first by design: the primary CTA is the host's own booking link,
// there are no off-site directory links, and branding is the host's logo +
// accent color with a single demoted Eddy credit.

import type { Metadata } from 'next';
import { getEmbedCardData } from '@/lib/embed/cards';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { WEEKEND_FLOATABLE } from '@shared/condition-system';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false },
};

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';
const DEFAULT_ACCENT = '#2D7889';

const VERDICT_TEXT: Record<string, { headline: string; detail: string }> = {
  flowing: { headline: 'Yes — great day to float', detail: 'Ideal water levels right now' },
  good: { headline: 'Yes — good to float', detail: 'Solid, floatable conditions' },
  high: { headline: 'Floatable — use caution', detail: 'High water and fast current' },
  low: { headline: 'Marginal today', detail: 'Shallow — expect some scraping' },
  too_low: { headline: 'Not today', detail: 'Too low to float comfortably' },
  dangerous: { headline: 'No — stay off the water', detail: 'Flood conditions, do not float' },
  unknown: { headline: 'Check locally', detail: 'No current reading for this reach' },
};

interface Props {
  params: Promise<{ embedId: string }>;
  searchParams: Promise<{ theme?: string }>;
}

export default async function EmbedCardPage({ params, searchParams }: Props) {
  const { embedId } = await params;
  const { theme } = await searchParams;
  const isDark = theme === 'dark';

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const cardBg = isDark ? '#222' : '#f9fafb';

  const card = await getEmbedCardData(embedId);

  if (!card) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  const code = card.condition?.code ?? 'unknown';
  const conditionColor = CONDITION_COLORS[code] || CONDITION_COLORS.unknown;
  const conditionLabel = CONDITION_SHORT_LABELS[code] || 'Unknown';
  const floatable = WEEKEND_FLOATABLE.has(code);
  const verdict = VERDICT_TEXT[code] || VERDICT_TEXT.unknown;
  const accent = card.accentColor || DEFAULT_ACCENT;

  // Distance line: real drive time when we have it; straight-line as the
  // degraded fallback (never fabricated minutes).
  const distanceLine = card.driveMinutes != null && card.driveMiles != null
    ? `${card.driveMiles.toFixed(1)} mi · ~${Math.round(card.driveMinutes)} min drive`
    : card.straightLineMiles != null
      ? `≈ ${card.straightLineMiles.toFixed(1)} mi away`
      : null;

  const gaugeLine = card.condition?.gaugeHeightFt != null
    ? `${card.condition.gaugeHeightFt.toFixed(2)} ft${card.condition.gaugeName ? ` at ${card.condition.gaugeName}` : ''}`
    : card.condition?.dischargeCfs != null
      ? `${Math.round(card.condition.dischargeCfs).toLocaleString()} cfs${card.condition.gaugeName ? ` at ${card.condition.gaugeName}` : ''}`
      : null;

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* Header: host brand first */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {card.logoUrl && (
          // Host logos live on arbitrary domains — next/image needs an
          // allowlist, so use a plain img and degrade silently.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.logoUrl}
            alt=""
            width={32}
            height={32}
            style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.riverName}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            Floatable from here right now?
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 10,
          background: `${conditionColor}12`,
          border: `1.5px solid ${conditionColor}40`,
        }}
      >
        <span
          role="img"
          aria-label={`Condition: ${conditionLabel}`}
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: conditionColor,
            flexShrink: 0,
            boxShadow: `0 0 0 4px ${conditionColor}25`,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2, color: floatable ? textPrimary : conditionColor }}>
            {verdict.headline}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
            {verdict.detail}
            {gaugeLine ? ` · ${gaugeLine}` : ''}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: conditionColor,
            padding: '3px 8px',
            borderRadius: 5,
            backgroundColor: `${conditionColor}18`,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {conditionLabel}
        </div>
      </div>

      {/* Launch: the location-aware line the public site can't show */}
      {card.accessPointName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            background: cardBg,
            border: `1px solid ${borderColor}`,
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Launch: {card.accessPointName}
          </span>
          {distanceLine && (
            <span style={{ color: textSecondary, flexShrink: 0, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
              {distanceLine}
            </span>
          )}
        </div>
      )}

      {/* Host CTA — the embedder's own conversion path */}
      {card.ctaUrl && (
        <a
          href={card.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 16px',
            background: accent,
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {card.ctaLabel || 'Book your trip'}
        </a>
      )}

      {/* Demoted credit — the only Eddy link on the card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {card.businessName && (
          <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500, marginRight: 'auto' }}>
            {card.businessName}
          </span>
        )}
        <a
          href={`https://eddy.guide${card.riverPath}?utm_source=eddy_embed&utm_medium=card&utm_campaign=${card.embedId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textSecondary, textDecoration: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EDDY_LOGO}
            alt=""
            width={14}
            height={14}
            style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
          />
          River data by Eddy
        </a>
      </div>
    </div>
  );
}
