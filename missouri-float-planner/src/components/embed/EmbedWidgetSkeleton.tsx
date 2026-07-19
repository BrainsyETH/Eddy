'use client';

import type { CSSProperties } from 'react';
import { EMBED_FONTS, type EmbedPalette } from '@/lib/embed/theme';

export default function EmbedWidgetSkeleton({
  palette,
  variant,
}: {
  palette: EmbedPalette;
  variant: 'quote' | 'conditions';
}) {
  const blockStyle = {
    '--embed-skeleton': palette.skeleton,
  } as CSSProperties;

  return (
    <div
      role="status"
      aria-label="Loading current river conditions"
      style={{
        fontFamily: EMBED_FONTS.body,
        background: palette.bg,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
        minHeight: variant === 'conditions' ? 320 : 300,
      }}
    >
      <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: palette.border }}>
        <span className="embed-skeleton h-9 w-9 flex-shrink-0 rounded-full" style={blockStyle} />
        <div className="flex-1 space-y-2">
          <span className="embed-skeleton block h-4 w-2/5 rounded" style={blockStyle} />
          <span className="embed-skeleton block h-3 w-1/3 rounded" style={blockStyle} />
        </div>
        <span className="embed-skeleton h-7 w-20 rounded-md" style={blockStyle} />
      </div>
      <div className="flex justify-between">
        <span className="embed-skeleton h-3 w-20 rounded" style={blockStyle} />
        <span className="embed-skeleton h-3 w-28 rounded" style={blockStyle} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map(index => (
          <div
            key={index}
            className="flex flex-col items-center rounded-[13px] border p-2.5"
            style={{ borderColor: palette.border, background: palette.cardBg }}
          >
            <span className="embed-skeleton block h-[20px] w-20 rounded-full" style={blockStyle} />
            <span className="embed-skeleton mt-2 block h-4 w-14 rounded" style={blockStyle} />
            <span className="embed-skeleton mt-1.5 block h-2.5 w-12 rounded" style={blockStyle} />
          </div>
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <span className="embed-skeleton block h-4 w-28 rounded" style={blockStyle} />
        <span className="embed-skeleton block h-3 w-full rounded" style={blockStyle} />
        <span className="embed-skeleton block h-3 w-4/5 rounded" style={blockStyle} />
        {variant === 'conditions' && <span className="embed-skeleton mt-2 block h-20 w-full rounded-lg" style={blockStyle} />}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmbedUnavailableState({
  palette,
  minHeight = 180,
}: {
  palette: EmbedPalette;
  minHeight?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight,
        background: palette.bg,
        color: palette.textPrimary,
        padding: 16,
        display: 'grid',
        placeItems: 'center',
        boxSizing: 'border-box',
        fontFamily: EMBED_FONTS.body,
      }}
    >
      <div className="w-full rounded-lg border px-4 py-5 text-center" style={{ borderColor: palette.border, background: palette.cardBg }}>
        <div className="text-sm font-bold">River conditions temporarily unavailable</div>
        <div className="mt-1 text-xs leading-5" style={{ color: palette.textSecondary }}>
          Current readings could not be loaded. Check back shortly.
        </div>
      </div>
    </div>
  );
}
