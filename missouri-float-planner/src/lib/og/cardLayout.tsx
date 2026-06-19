/* eslint-disable @next/next/no-img-element */
// src/lib/og/cardLayout.tsx
// Shared layout for Eddy's social share cards (1200×630) so River Reports,
// Guides, and the planner all read as one clean, branded family: an "Eddy"
// logo lockup, a title, and at most one supporting line — no clutter.

import type { ReactElement } from 'react';
import { BRAND_COLORS } from './colors';

const BG = '#1A3D40';

function titleSize(title: string): number {
  if (title.length > 72) return 52;
  if (title.length > 52) return 62;
  if (title.length > 34) return 74;
  if (title.length > 18) return 90;
  return 108;
}

export interface ContentCardOpts {
  /** Small coral kicker above the title, e.g. "RIVER GUIDE". */
  eyebrow?: string;
  title: string;
  /** Defaults to white; River Reports pass coral for the river name. */
  titleColor?: string;
  /** One supporting line — a tagline or the live Eddy quote. */
  body?: string;
  /** Eddy favicon/otter data URI for the top-left logo lockup. */
  avatar?: string | null;
  /** Optional large otter, rendered bottom-right for personality. */
  otter?: string | null;
}

export function ContentCard({
  eyebrow,
  title,
  titleColor = '#ffffff',
  body,
  avatar,
  otter,
}: ContentCardOpts): ReactElement {
  const hasOtter = !!otter;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: BG,
        position: 'relative',
        padding: '64px 72px',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Logo lockup — top left */}
      <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', top: 56, left: 72, gap: 14 }}>
        {avatar && <img src={avatar} width={56} height={56} alt="" style={{ borderRadius: 12 }} />}
        <span style={{ fontFamily: 'Fredoka', fontSize: 40, fontWeight: 600, color: '#fff', letterSpacing: -1 }}>
          Eddy
        </span>
      </div>

      {eyebrow && (
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: BRAND_COLORS.accentCoral,
            marginBottom: 18,
          }}
        >
          {eyebrow}
        </span>
      )}

      <span
        style={{
          fontFamily: 'Fredoka',
          fontSize: titleSize(title),
          fontWeight: 600,
          color: titleColor,
          lineHeight: 1.04,
          letterSpacing: -1.5,
          maxWidth: hasOtter ? 760 : 1010,
        }}
      >
        {title}
      </span>

      {body && (
        <span
          style={{
            fontSize: 34,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.35,
            marginTop: 24,
            maxWidth: hasOtter ? 720 : 980,
          }}
        >
          {body}
        </span>
      )}

      {otter && (
        <img
          src={otter}
          width={210}
          height={210}
          alt=""
          style={{ position: 'absolute', bottom: 30, right: 40, objectFit: 'contain' }}
        />
      )}

      <span
        style={{
          position: 'absolute',
          bottom: 26,
          left: 72,
          fontSize: 20,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        eddy.guide
      </span>

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg, ${BRAND_COLORS.accentCoral} 0%, ${BRAND_COLORS.bluewater} 100%)`,
        }}
      />
    </div>
  );
}
