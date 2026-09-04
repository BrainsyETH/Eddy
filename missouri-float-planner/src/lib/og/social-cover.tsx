// src/lib/og/social-cover.tsx
//
// The social design system in Satori's dialect — the cover-side twin of the
// Remotion primitives (remotion/src/components/ReelMasthead, BrandCard,
// ReelDock, BrandCTA). Both draw from shared/social-brand.ts, so a reel and
// its cover share the masthead, cards, tiles, pill, button and tones by
// construction. Used by api/og/social; kept out of the route file because a
// Next route module may only export its handlers.
//
// Satori rules observed here: every element with more than one child is
// display:flex; fonts are Fredoka (everything) and Geist Mono (numerals,
// units, and the glyphs Fredoka lacks — arrows, ▲▼, °); no backdrop-filter.

import type React from 'react';
import {
  COVER_INSET,
  MEDIA_SCRIM,
  SURFACES,
  WORDMARK,
  buttonStyle,
  cardStyle,
  colors,
  conditionInk,
  gridCropGap,
  inkOn,
  pillStyle,
  severityGround,
  tileStyle,
  type SocialTone,
} from '@shared/social-brand';
import { CONDITION_SYSTEM } from '@shared/condition-system';

export type Size = { width: number; height: number };

export const MONO = 'Geist Mono';
export const DISPLAY = 'Fredoka';

/** Canonical condition style (solid / label / severity) for a code, unknown-safe. */
export function cond(code: string) {
  return CONDITION_SYSTEM[code as keyof typeof CONDITION_SYSTEM] ?? CONDITION_SYSTEM.unknown;
}

/** The SHORT canonical label ("Good", "Too Low") — the one the reels' pills and
 *  tiles use — never the app's long form ("Good - Floatable"), so a cover and
 *  its reel say the condition the same way. */
export function condLabel(code: string): string {
  return cond(code).label;
}

/** Intrinsic pixel size of a base64 PNG/JPEG data URI, read from its header, so
 *  a photo can be sized explicitly. Satori centers an overflowing flex child
 *  reliably, but its object-fit/object-position centering does not — which
 *  once left portrait 2:3 backgrounds anchored to one edge. */
export function imageDims(dataUri: string): { w: number; h: number } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2], 'base64');
    if (m[1] === 'png') {
      if (buf.length < 24) return null;
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG: walk segment markers to the Start-Of-Frame, which carries the size.
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Cover geometry ─────────────────────────────────────────────────────────

export interface Cover {
  size: Size;
  portrait: boolean;
  tone: SocialTone;
  inset: number;
  /** Content box, inside the inset and — on portrait — inside the 4:5 grid crop. */
  top: number;
  left: number;
  width: number;
  height: number;
  /** Type scale multiplier: portrait covers have room to shout. */
  k: number;
}

/**
 * A portrait cover is cropped to a 4:5 tile in the profile grid and in-feed,
 * lopping ~285px off the top AND bottom of a 1080×1920 canvas. Everything on
 * a cover lives inside that band, so nothing is ever decapitated in the grid.
 */
export function coverGeometry(size: Size, tone: SocialTone = 'light'): Cover {
  const portrait = size.height > size.width;
  const crop = gridCropGap(size.width, size.height);
  const inset = portrait ? COVER_INSET.portrait : COVER_INSET.square;
  return {
    size,
    portrait,
    tone,
    inset,
    top: crop + inset,
    left: inset,
    width: size.width - inset * 2,
    height: size.height - (crop + inset) * 2,
    k: portrait ? 1 : 0.84,
  };
}

/** Largest cover title that still fits the content box, scaled by name length. */
export function heroFontSize(name: string, cover: Cover): number {
  const n = (name || '').length;
  const base = n <= 10 ? 124 : n <= 14 ? 106 : n <= 18 ? 92 : n <= 24 ? 78 : 64;
  return Math.round(base * cover.k);
}

// ─── Primitives ─────────────────────────────────────────────────────────────

export function CoverPage({
  cover,
  severity,
  photo,
  scrim,
  children,
}: {
  cover: Cover;
  /** Dark tone: wash the ground toward a condition colour. */
  severity?: string;
  /** Dark tone: full-bleed art under a legibility scrim. */
  photo?: string | null;
  scrim?: string;
  children: React.ReactNode;
}) {
  const s = SURFACES[cover.tone];
  const ground = cover.tone === 'dark' && severity ? severityGround(severity) : s.ground;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: ground,
        color: s.ink,
        fontFamily: DISPLAY,
        position: 'relative',
      }}
    >
      {photo ? <FullBleedPhoto dataUri={photo} size={cover.size} scrim={scrim ?? MEDIA_SCRIM.neutral} /> : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: cover.top,
          left: cover.left,
          width: cover.width,
          height: cover.height,
          gap: Math.round(28 * cover.k),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Full-frame photo + scrim (dark covers only). Pinned in explicit pixels: the
 *  Satori build resolves a percentage size on an absolutely-positioned child
 *  against the parent's CONTENT box, which once left a one-padding gap. */
export function FullBleedPhoto({ dataUri, size, scrim }: { dataUri: string; size: Size; scrim: string }) {
  const dims = imageDims(dataUri);
  const coverScale = dims ? Math.max(size.width / dims.w, size.height / dims.h) : 1;
  const imgStyle = dims
    ? { width: Math.ceil(dims.w * coverScale), height: Math.ceil(dims.h * coverScale), flexShrink: 0 }
    : { width: size.width, height: size.height, objectFit: 'cover' as const, flexShrink: 0 };
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: size.width, height: size.height }}>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: size.width,
          height: size.height,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} alt="" style={imgStyle} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: size.width, height: size.height, background: scrim }} />
    </div>
  );
}

export function CoverPill({
  cover,
  fill = colors.accent[500],
  size,
  children,
}: {
  cover: Cover;
  fill?: string;
  size?: number;
  children: React.ReactNode;
}) {
  const fs = size ?? Math.round(28 * cover.k);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        ...pillStyle(cover.tone, fill),
        padding: `${Math.round(fs * 0.34)}px ${Math.round(fs * 0.8)}px`,
        fontFamily: DISPLAY,
        fontSize: fs,
        fontWeight: 600,
        color: inkOn(fill),
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

/** The masthead: series pill + otter + wordmark on one row, then the hero
 *  line and its subtitle. Identical in structure to the reels' ReelMasthead. */
export function CoverMasthead({
  cover,
  label,
  labelFill,
  title,
  subtitle,
  subtitleNode,
  otter,
}: {
  cover: Cover;
  label: string;
  labelFill?: string;
  title: string;
  subtitle?: string;
  /** A pre-built subtitle row (coloured spans) instead of plain text. */
  subtitleNode?: React.ReactNode;
  otter?: string | null;
}) {
  const s = SURFACES[cover.tone];
  const otterH = Math.round(132 * cover.k);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <CoverPill cover={cover} fill={labelFill}>{label}</CoverPill>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {otter ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otter} alt="" width={otterH} height={otterH} style={{ objectFit: 'contain' }} />
          ) : null}
          <span style={{ fontFamily: DISPLAY, fontSize: Math.round(32 * cover.k), fontWeight: 600, color: s.wordmark }}>{WORDMARK}</span>
        </div>
      </div>
      <span
        style={{
          marginTop: Math.round(22 * cover.k),
          fontFamily: DISPLAY,
          fontSize: heroFontSize(title, cover),
          fontWeight: 600,
          lineHeight: 0.95,
          letterSpacing: -2.5,
          color: s.ink,
        }}
      >
        {title}
      </span>
      {subtitleNode ? (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: Math.round(14 * cover.k), fontSize: Math.round(34 * cover.k), color: s.inkSecondary }}>
          {subtitleNode}
        </div>
      ) : subtitle ? (
        <span style={{ marginTop: Math.round(14 * cover.k), fontFamily: DISPLAY, fontSize: Math.round(34 * cover.k), fontWeight: 600, color: s.inkSecondary }}>
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}

/** The art, framed: the AI cover background (or the guide photo) inside a
 *  ruled, shadowed card — the same treatment the ClipReel gives its footage. */
export function CoverPhotoCard({ cover, dataUri, height }: { cover: Cover; dataUri: string; height: number }) {
  const dims = imageDims(dataUri);
  const boxW = cover.width;
  const coverScale = dims ? Math.max(boxW / dims.w, height / dims.h) : 1;
  const imgStyle = dims
    ? { width: Math.ceil(dims.w * coverScale), height: Math.ceil(dims.h * coverScale), flexShrink: 0 }
    : { width: boxW, height, objectFit: 'cover' as const, flexShrink: 0 };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: boxW,
        height,
        overflow: 'hidden',
        ...cardStyle(cover.tone),
        padding: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUri} alt="" style={imgStyle} />
    </div>
  );
}

export function CoverCard({
  cover,
  accent,
  padding,
  style,
  children,
}: {
  cover: Cover;
  accent?: string;
  padding?: number | string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        ...cardStyle(cover.tone, accent),
        padding: padding ?? Math.round(24 * cover.k),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface TileSpec {
  value: string;
  unit?: string;
  label: string;
  color?: string;
  compact?: boolean;
}

export function CoverTile({ cover, tile }: { cover: Cover; tile: TileSpec }) {
  const s = SURFACES[cover.tone];
  const valueSize = Math.round((tile.compact ? 40 : 58) * cover.k);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: Math.round(140 * cover.k),
        ...tileStyle(cover.tone),
        padding: `${Math.round(14 * cover.k)}px ${Math.round(10 * cover.k)}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: valueSize,
            fontWeight: 600,
            lineHeight: 1,
            color: tile.color ? conditionInk(tile.color, cover.tone) : s.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {tile.value}
        </span>
        {tile.unit ? (
          <span style={{ fontFamily: MONO, fontSize: Math.round(22 * cover.k), fontWeight: 700, color: s.inkMuted }}>{tile.unit}</span>
        ) : null}
      </div>
      <span
        style={{
          marginTop: Math.round(10 * cover.k),
          fontFamily: DISPLAY,
          fontSize: Math.round(19 * cover.k),
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: s.inkMuted,
        }}
      >
        {tile.label}
      </span>
    </div>
  );
}

/** Split a CTA's trailing glyph (→ or ▼) so it can be set in Geist Mono —
 *  Fredoka has no arrow glyphs. */
function splitArrow(text: string): { body: string; arrow: string } {
  const arrow = /[→▼]$/.test(text) ? text.slice(-1) : '';
  return { body: arrow ? text.slice(0, -1).trimEnd() : text, arrow };
}

/** The coral button — the same CTA every reel ends on, as a still. */
export function CoverButton({ cover, text, fill = colors.accent[500] }: { cover: Cover; text: string; fill?: string }) {
  const { body, arrow } = splitArrow(text);
  const fs = Math.round(30 * cover.k);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        ...buttonStyle(cover.tone, fill),
        padding: `${Math.round(14 * cover.k)}px ${Math.round(22 * cover.k)}px`,
        color: inkOn(fill),
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontFamily: DISPLAY, fontSize: fs, fontWeight: 600 }}>{body}</span>
      {arrow ? <span style={{ fontFamily: MONO, fontSize: fs, fontWeight: 700 }}>{arrow}</span> : null}
    </div>
  );
}

/** A caption-pointing CTA ("Full report below ▼") — text, not a button. */
export function CtaText({ cover, text }: { cover: Cover; text: string }) {
  const s = SURFACES[cover.tone];
  const { body, arrow } = splitArrow(text);
  const fs = Math.round(28 * cover.k);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: s.inkSecondary, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: fs, fontWeight: 600 }}>{body}</span>
      {arrow ? <span style={{ fontFamily: MONO, fontSize: fs, fontWeight: 700 }}>{arrow}</span> : null}
    </div>
  );
}

/** The dock: stat tiles, a detail line and the CTA — the bottom card every
 *  reel ends on, here as a still. */
export function CoverDock({
  cover,
  accent,
  tiles,
  detail,
  detailColor,
  cta,
  ctaFill,
  ctaAsText,
}: {
  cover: Cover;
  accent?: string;
  tiles?: TileSpec[];
  detail?: string;
  detailColor?: string;
  cta?: string;
  ctaFill?: string;
  ctaAsText?: boolean;
}) {
  const s = SURFACES[cover.tone];
  return (
    <CoverCard cover={cover} accent={accent}>
      {tiles && tiles.length > 0 ? (
        <div style={{ display: 'flex', gap: Math.round(16 * cover.k), width: '100%' }}>
          {tiles.map((tile) => (
            <CoverTile key={tile.label} cover={cover} tile={tile} />
          ))}
        </div>
      ) : null}
      {detail || cta ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: detail ? 'space-between' : 'flex-end',
            gap: 20,
            marginTop: tiles && tiles.length > 0 ? Math.round(20 * cover.k) : 0,
            padding: '0 6px',
          }}
        >
          {detail ? (
            <span style={{ fontFamily: DISPLAY, fontSize: Math.round(27 * cover.k), fontWeight: 600, color: detailColor ?? s.inkSecondary }}>
              {detail}
            </span>
          ) : null}
          {cta ? (
            ctaAsText ? (
              <CtaText cover={cover} text={cta} />
            ) : (
              <CoverButton cover={cover} text={cta} fill={ctaFill} />
            )
          ) : null}
        </div>
      ) : null}
    </CoverCard>
  );
}

/** One river as a row: swatch + name, then gauge + condition pill. */
export function CoverRiverRow({
  cover,
  name,
  conditionCode,
  gaugeFt,
  height,
  accent,
}: {
  cover: Cover;
  name: string;
  conditionCode: string;
  gaugeFt: number | null;
  height: number;
  accent?: string;
}) {
  const s = SURFACES[cover.tone];
  const c = cond(conditionCode);
  const k = Math.max(0.6, Math.min(1, height / 104));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height,
        background: s.surface,
        border: `4px solid ${accent ?? s.rule}`,
        borderRadius: 16,
        boxShadow: `6px 6px 0 ${s.shadow}`,
        padding: `0 ${Math.round(24 * k)}px 0 ${Math.round(22 * k)}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(16 * k) }}>
        <div
          style={{
            display: 'flex',
            width: Math.round(22 * k),
            height: Math.round(22 * k),
            borderRadius: '50%',
            backgroundColor: c.solid,
            border: `3px solid ${s.chipRule}`,
          }}
        />
        <span style={{ fontFamily: DISPLAY, fontSize: Math.round(42 * k), fontWeight: 600, color: s.ink, whiteSpace: 'nowrap' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(18 * k) }}>
        {gaugeFt !== null ? (
          <span style={{ fontFamily: MONO, fontSize: Math.round(24 * k), fontWeight: 700, color: s.inkMuted }}>{gaugeFt.toFixed(1)} ft</span>
        ) : null}
        <CoverPill cover={cover} fill={c.solid} size={Math.round(22 * k)}>
          {condLabel(conditionCode)}
        </CoverPill>
      </div>
    </div>
  );
}

/** A quote (or a tip) in a card, with an optional small uppercase caption. */
export function CoverQuote({ cover, text, size, caption }: { cover: Cover; text: string; size: number; caption?: string }) {
  const s = SURFACES[cover.tone];
  return (
    <CoverCard cover={cover} padding={`${Math.round(28 * cover.k)}px ${Math.round(32 * cover.k)}px`}>
      <span style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 600, lineHeight: 1.3, color: s.ink }}>
        &ldquo;{text}&rdquo;
      </span>
      {caption ? (
        <span style={{ marginTop: Math.round(14 * cover.k), fontFamily: DISPLAY, fontSize: Math.round(20 * cover.k), fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: s.inkMuted }}>
          {caption}
        </span>
      ) : null}
    </CoverCard>
  );
}

/** Flexible spacer that pushes the dock to the foot of the content box. */
export function CoverSpacer() {
  return <div style={{ display: 'flex', flex: 1 }} />;
}
