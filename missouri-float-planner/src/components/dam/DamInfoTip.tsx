'use client';

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Native dialog supplies focus containment, Escape and focus restoration.
 * The glyph stays small so it reads as a footnote, not a control competing
 * with the readings; the button around it keeps the 44px target.
 */
export default function DamInfoTip({ title, children, label, anchored = false, className = '' }: {
  title: string;
  children: ReactNode;
  /** Make the whole explanation label tappable, rather than just the glyph. */
  label?: string;
  /** Anchor beside the label on desktop; retain the bottom sheet on phones. */
  anchored?: boolean;
  className?: string;
}) {
  const id = useId();
  const [position, setPosition] = useState<CSSProperties>();
  const [isOpen, setIsOpen] = useState(false);
  const dialog = useFocusTrap<HTMLDialogElement>(anchored && isOpen, () => dialog.current?.close());
  useEffect(() => {
    if (!anchored || !isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [anchored, isOpen]);
  useEffect(() => {
    if (!anchored) return;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const close = () => {
      if (width === window.innerWidth && height === window.innerHeight) return;
      width = window.innerWidth;
      height = window.innerHeight;
      dialog.current?.close();
    };
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [anchored]);
  const open = (button: HTMLButtonElement) => {
    if (anchored && window.matchMedia('(min-width: 640px)').matches) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 24;
      const above = rect.top - 24;
      const upwards = below < 400 && above > below;
      setPosition({
        width, margin: 0, right: 'auto',
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: upwards ? 'auto' : rect.bottom + 8,
        bottom: upwards ? window.innerHeight - rect.top + 8 : 'auto',
        maxHeight: Math.max(120, upwards ? above : below),
      });
    } else setPosition(undefined);
    dialog.current?.showModal();
    setIsOpen(true);
  };
  return (
    <>
      {label ? <Button variant="ghost" className="min-h-11 justify-start gap-2 px-0 text-sm text-primary-700"
        aria-label={`${label}. About ${title.toLowerCase()}`} aria-haspopup="dialog"
        onClick={(event) => open(event.currentTarget)}>
        {label}<Info className="size-4 shrink-0" aria-hidden="true" />
      </Button> : <button
        type="button"
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        onClick={(event) => open(event.currentTarget)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>}
      <dialog
        ref={dialog}
        aria-labelledby={id}
        style={position}
        onClose={() => setIsOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
        className={`fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-neutral-950/40 sm:inset-0 sm:m-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-2xl ${className}`}
      >
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id={id} className="text-lg font-bold">{title}</h3>
            <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close explanation" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary-600">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-neutral-600">{children}</div>
        </div>
      </dialog>
    </>
  );
}
