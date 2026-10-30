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
// Badge frames render inline-block so EmbedAutoResize reports a width and the
// host iframe hugs the pill; every other size is a block that fills the iframe.

import type { CSSProperties, ReactNode } from 'react';
import { EMBED_FONTS } from '@/lib/embed/theme';
import { embedThemeCss, type EmbedOptions, type EmbedSize } from '@/lib/embed/options';

export const EMBED_FRAME_ID = 'eddy-embed';

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
  const style: CSSProperties = {
    fontFamily: EMBED_FONTS.body,
    color: 'var(--ew-text)',
    background: inline ? 'transparent' : 'var(--ew-bg)',
    display: inline ? 'inline-block' : 'flex',
    flexDirection: inline ? undefined : 'column',
    gap: inline ? undefined : size === 'strip' ? 0 : 10,
    padding: inline ? 0 : size === 'strip' ? '8px 12px' : '14px 16px',
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
      style={style}
    >
      <style>{embedThemeCss(EMBED_FRAME_ID, options)}</style>
      {children}
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
      <div
        role="status"
        aria-live="polite"
        className="ew-panel"
        style={{ padding: '14px 16px', textAlign: 'center' }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>{message}</div>
        <div style={{ fontSize: 11, color: 'var(--ew-muted)', marginTop: 4 }}>
          Current readings could not be loaded. Check back shortly.
        </div>
      </div>
    </EmbedFrame>
  );
}
