'use client';

import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import {
  FLOAT_FILTER_GROUPS, floatFilterCount,
  type FloatFilterKey, type FloatSearchInput,
} from '@shared/float-search';

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick}
    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 aria-pressed:border-primary-500 aria-pressed:bg-primary-500 aria-pressed:text-white">
    {on && <Check size={16} aria-hidden="true" />}{label}
  </button>;
}

/** The same groups and labels as the iOS Filters sheet. */
export default function FloatFilters({ input, onChange, children }: {
  input: FloatSearchInput;
  onChange: (patch: Partial<FloatSearchInput>) => void;
  /** The submit control, kept on the Filters row so the form ends in one line. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const count = floatFilterCount(input);
  const toggle = (key: FloatFilterKey) => onChange({ filters: { ...input.filters, [key]: !input.filters?.[key] } });

  return <div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(value => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border-strong)] px-4 text-sm font-semibold hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">
        <SlidersHorizontal size={16} aria-hidden="true" />Filters
        {count > 0 && <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-500 px-2 text-xs text-white">{count}<span className="sr-only"> on</span></span>}
        <ChevronDown size={16} aria-hidden="true" className={open ? 'rotate-180' : ''} />
      </button>
      {count > 0 && <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[var(--color-primary-600)] underline-offset-4 hover:underline"
        onClick={() => onChange({ filters: undefined, publicOnly: true })}>Reset</button>}
      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">{children}</div>
    </div>
    <div id={panel} hidden={!open} className={`${open ? 'grid' : 'hidden'} mt-5 gap-5 border-t border-[var(--color-border)] pt-5 md:grid-cols-3`}>
      {FLOAT_FILTER_GROUPS.map(group => <fieldset key={group.title} className="min-w-0">
        <legend className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{group.title}</legend>
        <div className="flex flex-wrap gap-2">
          {group.title === 'Access' && <Toggle on={input.publicOnly} label="Public access only" onClick={() => onChange({ publicOnly: !input.publicOnly })} />}
          {group.filters.map(filter => <Toggle key={filter.key} on={Boolean(input.filters?.[filter.key])} label={filter.label} onClick={() => toggle(filter.key)} />)}
        </div>
      </fieldset>)}
    </div>
  </div>;
}
