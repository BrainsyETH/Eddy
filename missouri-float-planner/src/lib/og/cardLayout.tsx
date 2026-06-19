/* eslint-disable @next/next/no-img-element */
// src/lib/og/cardLayout.tsx
// Field Notebook social cards (1200×630): sandbar background with faint topo
// contour lines, a thick brutalist border, an Eddy logo lockup, a mono-style
// eyebrow, a big coral title, and an accent bar — matching the river-guide
// look. Shared shell (CardFrame) + reusable Pill / StatBox / Sparkline.

import type { ReactNode } from 'react';

// ── palette (mirrors globals.css tokens) ──────────────────────────────
const SAND = '#F4EFE7';        // secondary-100 — card background
const SAND_FRAME = '#E7E1D4';  // outer matte
const INK = '#2D2A24';         // neutral-900 — border / wordmark
const INK_SOFT = '#3F3B33';    // neutral-800 — body
const TEAL = '#1D525F';        // primary-700 — eyebrow
const CORAL = '#F07052';       // accent-500 — title
const TOPO = '#E2D7C2';        // faint contour line on sand

export interface ConditionMeta {
  accent: string;
  tint: string;
  label: string;
}

const CONDITIONS: Record<string, ConditionMeta> = {
  flowing: { accent: '#2E9E5B', tint: '#D7F0DF', label: 'Flowing' },
  good: { accent: '#3FA463', tint: '#D7F0DF', label: 'Good' },
  low: { accent: '#D69500', tint: '#FBEFC8', label: 'Low' },
  too_low: { accent: '#9A8C78', tint: '#E9E2D5', label: 'Too Low' },
  high: { accent: '#E5733A', tint: '#FBE0D0', label: 'High' },
  dangerous: { accent: '#DC2626', tint: '#F8D6D2', label: 'Flood' },
  unknown: { accent: '#9CA3AF', tint: '#E9E6E0', label: 'Unknown' },
};

export function conditionMeta(code: string | null | undefined): ConditionMeta {
  return CONDITIONS[code ?? 'unknown'] ?? CONDITIONS.unknown;
}

// Topographic contour lines across the card, generated as gentle waves.
function topoPaths(): string[] {
  const paths: string[] = [];
  const period = 520;
  const amp = 24;
  for (let i = 0; i < 8; i++) {
    const y = -10 + i * 90;
    let d = `M -60 ${y}`;
    let dir = i % 2 === 0 ? -1 : 1;
    for (let x = -60; x < 1320; x += period) {
      d += ` c ${period * 0.35} ${dir * amp} ${period * 0.65} ${dir * amp} ${period} 0`;
      dir *= -1;
    }
    paths.push(d);
  }
  return paths;
}

function Topo() {
  return (
    <svg
      width={1200}
      height={630}
      viewBox="0 0 1200 630"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {topoPaths().map((d, i) => (
        <path key={i} d={d} fill="none" stroke={TOPO} strokeWidth={2.5} />
      ))}
    </svg>
  );
}

export function Pill({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#fff',
        border: `2px solid ${dot}`,
        borderRadius: 999,
        padding: '8px 18px',
        fontSize: 24,
        fontWeight: 600,
        color: INK_SOFT,
      }}
    >
      <div style={{ width: 13, height: 13, borderRadius: 999, background: dot }} />
      {children}
    </div>
  );
}

export function StatBox({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value?: string;
  unit?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        gap: 10,
        background: '#fff',
        border: `2px solid ${INK}`,
        borderRadius: 14,
        padding: '18px 22px',
        boxShadow: `3px 3px 0 ${INK}`,
      }}
    >
      <span
        style={{
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: TEAL,
        }}
      >
        {label}
      </span>
      {children ?? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'Fredoka', fontSize: 58, fontWeight: 600, color: INK, lineHeight: 1, letterSpacing: -1 }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: 28, fontWeight: 600, color: '#857D70' }}>{unit}</span>}
        </div>
      )}
    </div>
  );
}

// Mini line chart for a stat box (e.g. 14-day trend).
export function Sparkline({ points, color = '#3FA463' }: { points: number[]; color?: string }) {
  const w = 230;
  const h = 64;
  const pad = 6;
  if (points.length < 2) {
    return <div style={{ display: 'flex', height: h }} />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ marginTop: 4 }}>
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface CardBadge {
  label: string;
  accent: string;
  tint: string;
}

export interface CardFrameProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  titleColor?: string;
  avatar?: string | null;
  otter?: string | null;
  badge?: CardBadge | null;
  accent?: string;
  watermark?: string;
  children?: ReactNode;
}

function titleSize(title: string): number {
  if (title.length > 34) return 66;
  if (title.length > 24) return 80;
  if (title.length > 15) return 94;
  return 108;
}

export function CardFrame({
  eyebrow,
  eyebrowColor = TEAL,
  title,
  titleColor = CORAL,
  avatar,
  otter,
  badge,
  accent = TEAL,
  watermark = 'eddy.guide',
  children,
}: CardFrameProps) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: SAND_FRAME, padding: 18 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          flex: 1,
          background: SAND,
          border: `5px solid ${INK}`,
          borderRadius: 24,
          overflow: 'hidden',
          padding: '44px 52px',
        }}
      >
        <Topo />

        {/* Header: logo lockup + optional status badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {avatar && <img src={avatar} width={56} height={56} alt="" style={{ borderRadius: 12 }} />}
            <span style={{ fontFamily: 'Fredoka', fontSize: 38, fontWeight: 600, color: INK, letterSpacing: -1 }}>
              Eddy
            </span>
          </div>
          {badge && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: badge.tint,
                border: `2.5px solid ${INK}`,
                borderRadius: 999,
                padding: '10px 24px',
                boxShadow: `3px 3px 0 ${INK}`,
              }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 999, background: badge.accent }} />
              <span style={{ fontFamily: 'Fredoka', fontSize: 30, fontWeight: 600, color: INK }}>{badge.label}</span>
            </div>
          )}
        </div>

        {/* Eyebrow */}
        <span
          style={{
            marginTop: 30,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: eyebrowColor,
          }}
        >
          {eyebrow}
        </span>

        {/* Title */}
        <span
          style={{
            fontFamily: 'Fredoka',
            fontSize: titleSize(title),
            fontWeight: 600,
            color: titleColor,
            lineHeight: 1.0,
            letterSpacing: -2,
            marginTop: 10,
            maxWidth: otter ? 720 : 1040,
          }}
        >
          {title}
        </span>

        {/* Body / type-specific content */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>{children}</div>

        {/* Canoe otter */}
        {otter && (
          <img
            src={otter}
            width={250}
            height={250}
            alt=""
            style={{ position: 'absolute', bottom: 36, right: 44, objectFit: 'contain' }}
          />
        )}

        {/* Watermark */}
        <span style={{ position: 'absolute', bottom: 28, left: 52, fontSize: 20, fontWeight: 600, color: '#857D70' }}>
          {watermark}
        </span>

        {/* Accent bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, background: accent }} />
      </div>
    </div>
  );
}

export { CORAL, TEAL, INK, INK_SOFT, SAND }
