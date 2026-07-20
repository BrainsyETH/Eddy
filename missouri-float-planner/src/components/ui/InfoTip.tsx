'use client';

// src/components/ui/InfoTip.tsx
// Small, self-contained "(i)" info button + popover. Works on the app pages and
// inside the embed iframes alike: colors are passed in, and the popover is
// position:fixed with a coordinate computed from the trigger, so it escapes any
// `overflow:hidden` ancestor (chart cards, reading cards) instead of clipping.

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface InfoTipColors {
  /** (i) glyph color. */
  trigger: string;
  triggerBorder: string;
  popBg: string;
  popBorder: string;
  title: string;
  body: string;
  focus: string;
}

interface InfoTipProps {
  title: string;
  body: string;
  ariaLabel: string;
  colors: InfoTipColors;
  size?: number;
}

const POPOVER_WIDTH = 240;

export default function InfoTip({ title, body, ariaLabel, colors, size = 16 }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Compute the fixed position from the trigger rect, clamped to the viewport.
  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 20);
    let left = b.left;
    if (left + width > window.innerWidth - 10) left = window.innerWidth - 10 - width;
    if (left < 10) left = 10;
    setPos({ top: Math.round(b.bottom + 6), left: Math.round(left) });
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // Fixed popover can't follow a scroll/resize — close instead of drift.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const glyph = Math.round(size * 0.72);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={toggle}
        className="info-tip-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
          width: size,
          height: size,
          padding: 0,
          borderRadius: '9999px',
          border: `1px solid ${colors.triggerBorder}`,
          background: 'transparent',
          color: colors.trigger,
          cursor: 'pointer',
          lineHeight: 0,
          verticalAlign: 'middle',
          '--info-focus': colors.focus,
        } as CSSProperties}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11.4v4.4" />
          <path d="M12 7.7h.01" />
        </svg>
      </button>
      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={title}
          style={{
            position: 'fixed',
            zIndex: 2147483000,
            top: pos.top,
            left: pos.left,
            width: `min(${POPOVER_WIDTH}px, calc(100vw - 20px))`,
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 10,
            background: colors.popBg,
            border: `1px solid ${colors.popBorder}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.20)',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3, color: colors.title }}>{title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: colors.body }}>{body}</div>
        </div>
      )}
    </>
  );
}
