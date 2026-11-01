'use client';

// src/components/ui/LayerRow.tsx
// One map layer: a mark, a label, and a switch. The website's twin of a row in
// the app's layers sheet (eddy-ios/src/components/MapLayersSheet.tsx), and
// built the same way for the same reasons:
//
// ── The well is outlined, not filled ────────────────────────────────────────
// Eddy's marks are fixed-colour art (see EddyIcon). A filled, tinted well with
// the art on it is a coral pin on a coral chip. The well is a frame; on/off is
// carried by its border, the mark's opacity, and the switch — which is the one
// place that DRAWS the state. A row with no Eddy drawing yet passes a Lucide
// glyph, tinted with `currentColor`, which the row sets per state.
//
// ── Light and dark ──────────────────────────────────────────────────────────
// `dark` is the Live River Map dock: a fixed dark surface that does not follow
// the site theme. Everywhere else the row reads the semantic tokens, so the
// planner's dark mode holds without a prop.

import type { ReactNode } from 'react';

export function LayerRow({
  mark,
  label,
  sublabel,
  on,
  onClick,
  dark = false,
}: {
  /** An `<EddyIcon>` (preferred) or a Lucide glyph at ~16px. */
  mark: ReactNode;
  label: string;
  sublabel?: string;
  on: boolean;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors ${
        dark ? 'hover:bg-white/10' : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <span
        aria-hidden
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 transition-colors ${
          on
            ? dark ? 'border-primary-300 text-primary-200' : 'border-primary-600 text-primary-600'
            : dark ? 'border-white/25 text-white/50' : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)]'
        } ${dark ? 'bg-white/5' : 'bg-[var(--color-surface)]'}`}
      >
        <span className={`grid place-items-center transition-opacity ${on ? '' : 'opacity-45'}`}>{mark}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${dark ? 'text-white' : 'text-[color:var(--color-text-primary)]'}`}>
          {label}
        </span>
        {sublabel && (
          <span className={`block truncate text-[11px] ${dark ? 'text-white/65' : 'text-[color:var(--color-text-muted)]'}`}>
            {sublabel}
          </span>
        )}
      </span>
      <LayerSwitch on={on} dark={dark} />
    </button>
  );
}

/** The track and knob. Presentational: the row it sits in is the control. */
export function LayerSwitch({ on, dark = false }: { on: boolean; dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-5 w-9 shrink-0 rounded-full border-2 transition-colors ${
        on
          ? 'border-primary-700 bg-primary-600'
          : dark ? 'border-white/30 bg-white/15' : 'border-[color:var(--color-border-strong)] bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-neutral-900/20 bg-white transition-all ${
          on ? 'left-[17px]' : 'left-[1px]'
        }`}
      />
    </span>
  );
}

/**
 * A narrowing chip under a layer row: "also only these". Outlined rather than
 * filled when pressed, so a fixed-colour Eddy mark inside it stays legible.
 */
export function LayerChip({
  pressed,
  onClick,
  children,
  dark = false,
  title,
  className = '',
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  dark?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={`flex min-h-9 items-center gap-1.5 rounded-md border-2 px-2 py-1 text-left text-xs font-semibold transition-colors ${
        pressed
          ? dark
            ? 'border-primary-300 bg-primary-300/15 text-white'
            : 'border-primary-600 bg-primary-600/10 text-[color:var(--color-text-primary)]'
          : dark
            ? 'border-white/20 text-white/70 hover:border-white/40'
            : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-primary-300'
      } ${className}`}
    >
      {children}
    </button>
  );
}
