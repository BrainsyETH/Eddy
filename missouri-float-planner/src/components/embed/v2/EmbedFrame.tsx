// src/components/embed/v2/EmbedFrame.tsx
// The one root every member of the embed family renders inside.
//
// It owns the theme: the Organic Brutalist tokens arrive as `--ew-*` custom
// properties from a <style> it emits (light, dark, or light + a
// prefers-color-scheme override for `auto`), and everything below it styles
// with var(--ew-…) only. That is what lets one component tree serve three
// themes, a transparent background and a partner accent without a second
// render path — and why the trend chart can be handed a palette of var()
// strings and simply work.
//
// The card is the site's `.card-framed` treatment — white surface, 2px
// primary-700 border, 8px corners, the 3px hard `--shadow-md` — so a widget
// on a partner's page looks like the dam and river cards on eddy.guide.
//
// ── Why the frame sits inside a gutter ──────────────────────────────────────
// The host iframe is sized from document.body.scrollHeight, and a box-shadow
// adds nothing to scroll size: a hard shadow flush with the iframe edge is
// cut off at the bottom and right. The outer section pads by the shadow's
// offset so the shadow is inside the measured box. `bg=transparent` drops the
// frame (border, shadow and surface) and the widget sits on the host's page.

import type { CSSProperties, ReactNode } from 'react';
import { EMBED_FONTS } from '@/lib/embed/theme';
import { embedThemeCss, type EmbedOptions, type EmbedSize } from '@/lib/embed/options';

export const EMBED_FRAME_ID = 'eddy-embed';

/** The hard shadow's offset; the gutter must match it. */
const SHADOW_GUTTER = 3;

export default function EmbedFrame({
  size,
  options,
  kind,
  label,
  children,
}: {
  size: EmbedSize;
  options: Pick<EmbedOptions, 'theme' | 'transparent' | 'accent'>;
  kind: 'river' | 'dam';
  /** Accessible name for the whole widget region. */
  label: string;
  children: ReactNode;
}) {
  const inline = size === 'badge';
  const outer: CSSProperties = {
    fontFamily: EMBED_FONTS.body,
    color: 'var(--ew-text)',
    background: 'transparent',
    display: inline ? 'inline-block' : 'block',
    padding: `0 ${SHADOW_GUTTER}px ${SHADOW_GUTTER}px 0`,
    boxSizing: 'border-box',
    WebkitFontSmoothing: 'antialiased',
  };
  return (
    <section
      id={EMBED_FRAME_ID}
      className={`ew ew-${size}`}
      data-eddy-embed-kind={kind}
      data-eddy-embed-size={size}
      aria-label={label}
      style={outer}
    >
      <style>{embedThemeCss(EMBED_FRAME_ID, options)}</style>
      {inline ? children : <div className={`ew-card ew-card-${size}`}>{children}</div>}
    </section>
  );
}

/** Unavailable state in the same frame, so the host sees a tidy card, not a blank. */
export function EmbedUnavailable({
  size,
  options,
  kind,
  message,
}: {
  size: EmbedSize;
  options: Pick<EmbedOptions, 'theme' | 'transparent' | 'accent'>;
  kind: 'river' | 'dam';
  message: string;
}) {
  if (size === 'badge') {
    return (
      <EmbedFrame size="badge" options={options} kind={kind} label={message}>
        <span className="ew-badge" role="status">
          <span className="ew-badge-text">{message}</span>
        </span>
      </EmbedFrame>
    );
  }
  return (
    <EmbedFrame size={size} options={options} kind={kind} label={message}>
      <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '4px 0' }}>
        <p className="ew-body" style={{ fontWeight: 700 }}>{message}</p>
        <p className="ew-support" style={{ marginTop: 4 }}>Current readings could not be loaded. Check back shortly.</p>
      </div>
    </EmbedFrame>
  );
}
