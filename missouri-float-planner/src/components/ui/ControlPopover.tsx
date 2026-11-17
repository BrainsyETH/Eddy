'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import Button from './Button';

/** A nonmodal disclosure, kept inside its parent dialog's focus boundary. */
export default function ControlPopover({ label, children }: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;
  const close = () => {
    setPosition(null);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button:not([disabled]), select, input')?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (trigger.current?.contains(event.target as Node) || panel.current?.contains(event.target as Node)) return;
      setPosition(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      trigger.current?.focus({ preventScroll: true });
    };
    const resize = () => setPosition(null);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    // Close this disclosure before the expanded chart's document-level trap.
    window.addEventListener('keydown', escape, true);
    window.addEventListener('scroll', outside, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  return <>
    <Button ref={trigger} variant="control" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-haspopup="dialog" onClick={() => {
        if (open) { close(); return; }
        const rect = trigger.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(272, window.innerWidth - 24);
        const below = window.innerHeight - rect.bottom - 18;
        const above = rect.top - 18;
        const upwards = below < 300 && above > below;
        setPosition({
          left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
          width,
          ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
          maxHeight: Math.max(80, upwards ? above : below),
        });
      }}>
      {label}<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
    {position && <div ref={panel} id={id} role="dialog" aria-label={label}
      className="fixed z-[60] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 text-sm text-neutral-700 shadow-lg"
      style={position}>
      {children(close)}
    </div>}
  </>;
}
