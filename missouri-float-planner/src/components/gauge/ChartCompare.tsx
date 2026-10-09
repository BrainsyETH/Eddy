'use client';

// src/components/gauge/ChartCompare.tsx
// The detail charts' Compare control: one button and a popover holding the
// Last year layer. Positioned like InfoTip (fixed, from the trigger's rect) so
// the chart card's overflow cannot clip it.

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { LastYearStatus } from '@/hooks/useLastYearComparison';

const POPOVER_WIDTH = 260;

interface ChartCompareProps {
  on: boolean;
  onChange: (on: boolean) => void;
  status: LastYearStatus;
  onRetry: () => void;
}

export default function ChartCompare({ on, onChange, status, onRetry }: ChartCompareProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 20);
    const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - 10 - width));
    setPos({ top: Math.round(rect.bottom + 6), left: Math.round(left) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (popRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Window capture runs before the expanded dialog's document-level trap,
      // so Escape closes this popover first, not the dialog.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const detail = !on
    ? 'Daily average'
    : status === 'failed'
      ? 'Couldn’t load last year'
      : status === 'empty'
        ? 'No data for last year'
        : status === 'ready'
          ? 'Daily average'
          : 'Loading…';

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Compare{on ? ' · 1' : ''}
      </Button>
      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Compare"
          className="fixed z-[60] rounded-xl border p-2 shadow-lg"
          style={{
            top: pos.top,
            left: pos.left,
            width: `min(${POPOVER_WIDTH}px, calc(100vw - 20px))`,
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            className="flex w-full items-center justify-between gap-4 rounded-lg p-2 text-left transition-colors hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Last year
              </span>
              <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-text-secondary)' }} aria-live="polite">
                {detail}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-normal ease-in-out ${
                on ? 'bg-primary-500' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-normal ease-in-out ${
                  on ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
          {on && status === 'failed' && (
            <div className="px-2 pb-1">
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Retry
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
