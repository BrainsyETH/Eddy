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
  type SocialPlatform,
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
  /** Content box, inside the inset and — on portrait — inside the selected crop. */
  top: number;
  left: number;
  width: number;
  height: number;
  /** Type scale multiplier: portrait covers have room to shout. */
  k: number;
}

/** Keep the layout inside the selected platform's centered profile-tile crop.
 * Playback UI safe zones are separate and never participate in this geometry. */
export function coverGeometry(
  size: Size,
  tone: SocialTone = 'light',
  platform: SocialPlatform = 'instagram',
  squareSafe = false,
): Cover {
  const portrait = size.height > size.width;
  const crop = Math.max(gridCropGap(size.width, size.height, platform), squareSafe ? (size.height - size.width) / 2 : 0);
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
  wrap?: boolean;
}

export function CoverTile({ cover, tile }: { cover: Cover; tile: TileSpec }) {
  const s = SURFACES[cover.tone];
  const valueSize = Math.round((tile.wrap ? 28 : tile.compact ? 40 : 58) * cover.k);
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
            whiteSpace: tile.wrap ? 'normal' : 'nowrap',
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

// ─── Editorial covers ───────────────────────────────────────────────────────
// The profile-grid cover (docs/social-design-system.md, "Covers"): one
// headline, one visual, river + location, a small Eddy mark — no tiles, cards
// or buttons. Every essential element sits inside the centered 3:4 grid crop
// (coverGeometry's content box); the headline is the same size on every cover.
// What it says and which art it uses is decided by src/lib/social/cover-plan.ts.

export type EditorialTreatment = 'photo' | 'illustration' | 'conditions';

/** Illustration compositions: ground, ink, where the otter sits, where the text sits. */
const ILLUSTRATIONS = [
  { ground: colors.primary[800], ink: '#FFFFFF', muted: colors.primary[100], wave: colors.primary[500], zone: 'upper' as const },
  { ground: colors.secondary[100], ink: colors.neutral[900], muted: colors.neutral[700], wave: colors.secondary[300], zone: 'lower' as const },
  { ground: colors.neutral[50], ink: colors.primary[900], muted: colors.primary[700], wave: colors.primary[200], zone: 'lower' as const },
];

export function illustrationTextZone(variant: number): 'upper' | 'lower' {
  return ILLUSTRATIONS[Math.abs(variant) % ILLUSTRATIONS.length].zone;
}

/** Three hand-drawn-feeling river strokes across the canvas. */
function RiverStrokes({ width, top, color, k }: { width: number; top: number; color: string; k: number }) {
  const h = Math.round(260 * k);
  const path = (y: number, amp: number, phase: number) => {
    const pts: string[] = [];
    for (let x = -20; x <= width + 20; x += 20) {
      pts.push(`${x},${(y + Math.sin((x / width) * Math.PI * 2.2 + phase) * amp).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
  };
  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      style={{ position: 'absolute', left: 0, top }}
    >
      <path d={path(h * 0.3, 26 * k, 0)} fill="none" stroke={color} strokeWidth={14 * k} strokeLinecap="round" />
      <path d={path(h * 0.55, 30 * k, 0.9)} fill="none" stroke={color} strokeWidth={10 * k} strokeLinecap="round" opacity={0.7} />
      <path d={path(h * 0.8, 22 * k, 1.8)} fill="none" stroke={color} strokeWidth={7 * k} strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

/** A subline whose → is set in Geist Mono (Fredoka has no arrows). */
function SublineText({ text, size, color }: { text: string; size: number; color: string }) {
  const parts = text.split('→');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', fontFamily: DISPLAY, fontSize: size, fontWeight: 600, color, lineHeight: 1.2 }}>
      {parts.map((part, i) => (
        <div key={i} style={{ display: 'flex' }}>
          {i > 0 ? <span style={{ fontFamily: MONO, fontWeight: 700, margin: `0 ${Math.round(size * 0.3)}px` }}>→</span> : null}
          <span>{part.trim()}</span>
        </div>
      ))}
    </div>
  );
}

export function EditorialCover({
  cover,
  treatment,
  eyebrow,
  eyebrowFill,
  headline,
  subline,
  detail,
  textZone = 'lower',
  photo,
  mark,
  art,
  variant = 0,
  severity,
  observation,
}: {
  cover: Cover;
  treatment: EditorialTreatment;
  /** The series label, set small after the wordmark ("FLOAT PICK"). */
  eyebrow: string;
  /** Conditions: the label becomes a condition-coloured pill. */
  eyebrowFill?: string;
  headline: string;
  /** River + location, or the endpoints. */
  subline?: string;
  /** A second quiet line (e.g. the rate of rise). */
  detail?: string;
  /** Photo: where the photo leaves quiet room for the text. */
  textZone?: 'upper' | 'lower';
  /** Photo treatment: the photo as a PNG/JPEG data URI. */
  photo?: string | null;
  /** The small Eddy mark beside the wordmark (an otter data URI). */
  mark?: string | null;
  /** Illustration treatment: the large otter artwork. */
  art?: string | null;
  variant?: number;
  /** Conditions treatment: the condition colour. */
  severity?: string;
  /** Conditions treatment: the one big reading ("6.8" "FT"). */
  observation?: { value: string; unit: string } | null;
}) {
  const k = cover.k;
  const { width: W, height: H } = cover.size;
  const ill = ILLUSTRATIONS[Math.abs(variant) % ILLUSTRATIONS.length];
  const zone = treatment === 'illustration' ? ill.zone : treatment === 'conditions' ? 'lower' : textZone;
  const ink = treatment === 'illustration' ? ill.ink : '#FFFFFF';
  const muted = treatment === 'illustration' ? ill.muted : 'rgba(255,255,255,0.88)';
  const ground =
    treatment === 'conditions'
      ? severityGround(severity ?? colors.accent[600])
      : treatment === 'illustration'
        ? ill.ground
        : colors.primary[900];
  // Scrim only where the text is, so the photo stays the photo.
  const scrim =
    zone === 'upper'
      ? `linear-gradient(180deg, rgba(15,45,53,0.86) 0%, rgba(15,45,53,0.55) ${Math.round(((cover.top + cover.height * 0.45) / H) * 100)}%, rgba(15,45,53,0.05) 75%, rgba(15,45,53,0.15) 100%)`
      : `linear-gradient(0deg, rgba(15,45,53,0.88) 0%, rgba(15,45,53,0.6) ${Math.round(((H - cover.top - cover.height * 0.55) / H) * 100)}%, rgba(15,45,53,0.05) 70%, rgba(15,45,53,0.35) 100%)`;

  const headlineSize = Math.round(104 * k);
  const textBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', width: cover.width, gap: Math.round(18 * k) }}>
      {treatment === 'conditions' && observation ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(18 * k), marginBottom: Math.round(8 * k) }}>
          {/* Fredoka numerals: Geist Mono's fixed advance spaces "6.8" into "6 . 8" at this size. */}
          <span style={{ fontFamily: DISPLAY, fontSize: Math.round(230 * k), fontWeight: 600, color: severity ?? '#FFFFFF', lineHeight: 0.9, letterSpacing: -4 }}>
            {observation.value}
          </span>
          <span style={{ fontFamily: MONO, fontSize: Math.round(76 * k), fontWeight: 700, color: muted }}>{observation.unit}</span>
        </div>
      ) : null}
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: headlineSize,
          fontWeight: 600,
          lineHeight: 1.0,
          letterSpacing: -2,
          color: ink,
        }}
      >
        {headline}
      </span>
      {subline ? <SublineText text={subline} size={Math.round(40 * k)} color={muted} /> : null}
      {detail ? <SublineText text={detail} size={Math.round(34 * k)} color={muted} /> : null}
    </div>
  );

  // Illustration otter: opposite the text, inside the crop.
  const otterSize = Math.round((variant % 3 === 0 ? 560 : 500) * k);
  const otterTop = ill.zone === 'upper' ? cover.top + cover.height - otterSize : cover.top + Math.round(110 * k);
  const otterLeft = variant % 3 === 2 ? cover.left : W - cover.left - otterSize;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', background: ground, fontFamily: DISPLAY }}>
      {treatment === 'photo' && photo ? <FullBleedPhoto dataUri={photo} size={cover.size} scrim={scrim} /> : null}
      {treatment === 'illustration' ? (
        <RiverStrokes
          width={W}
          k={k}
          color={ill.wave}
          top={ill.zone === 'upper' ? cover.top + cover.height - Math.round(330 * k) : cover.top + Math.round(560 * k)}
        />
      ) : null}
      {treatment === 'illustration' && art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          width={otterSize}
          height={otterSize}
          style={{ position: 'absolute', left: otterLeft, top: otterTop, objectFit: 'contain' }}
        />
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: cover.top,
          left: cover.left,
          width: cover.width,
          height: cover.height,
        }}
      >
        {/* The Eddy mark — once, small, the same on every cover. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(14 * k) }}>
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark} alt="" width={Math.round(64 * k)} height={Math.round(64 * k)} style={{ objectFit: 'contain' }} />
          ) : null}
          <span style={{ fontFamily: DISPLAY, fontSize: Math.round(30 * k), fontWeight: 600, color: ink }}>{WORDMARK}</span>
          {eyebrowFill ? (
            <CoverPill cover={cover} fill={eyebrowFill} size={Math.round(24 * k)}>{eyebrow}</CoverPill>
          ) : (
            <span style={{ fontFamily: DISPLAY, fontSize: Math.round(26 * k), fontWeight: 600, color: muted, letterSpacing: 2, textTransform: 'uppercase' }}>
              {`/ ${eyebrow}`}
            </span>
          )}
        </div>
        {zone === 'upper' ? (
          <div style={{ display: 'flex', marginTop: Math.round(40 * k) }}>{textBlock}</div>
        ) : (
          <div style={{ display: 'flex', flex: 1 }} />
        )}
        {zone === 'lower' ? textBlock : null}
      </div>
    </div>
  );
}
