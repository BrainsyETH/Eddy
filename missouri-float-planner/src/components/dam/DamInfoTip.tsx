'use client';

import { useId, useRef, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

/** Native dialog supplies focus containment, Escape and focus restoration. */
export default function DamInfoTip({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <Info className="size-5" aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={id}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-neutral-950/40 sm:inset-0 sm:m-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-2xl"
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
