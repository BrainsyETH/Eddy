'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { LayerRow } from '@/components/ui/LayerRow';
import {
  FLOAT_FILTER_GROUPS, FLOAT_PUBLIC_ONLY_LABEL, floatFilterCount, floatFilterSelections,
  type FloatFilterKey, type FloatSearchInput,
} from '@shared/float-search';

// Below Tailwind's `sm`, filters open in a bottom sheet instead of inline.
const PHONE = '(max-width: 639px)';

// Each row's mark is Eddy's own drawing. Typed by filter key, so a new filter
// cannot ship without one (a Lucide glyph is LayerRow's fallback until it is drawn).
const MARKS: Record<FloatFilterKey | 'publicOnly', ReactNode> = {
  publicOnly: <EddyIcon name="boatRamp" size={20} />,
  restrooms: <EddyIcon name="facilities" size={20} />,
  camping: <EddyIcon name="campground" size={20} />,
  noFees: <EddyIcon name="noFees" size={20} />,
  smoothRoads: <EddyIcon name="road" size={20} />,
  beginner: <EddyIcon name="beginner" size={20} />,
  springFed: <EddyIcon name="spring" size={18} />,
  noPortages: <EddyIcon name="noPortages" size={20} />,
  goodConditions: <EddyIcon name="gaugeStation" size={20} />,
  shuttle: <EddyIcon name="outfitter" size={20} />,
};

function Groups({ input, onChange }: { input: FloatSearchInput; onChange: (patch: Partial<FloatSearchInput>) => void }) {
  const toggle = (key: FloatFilterKey) => onChange({ filters: { ...input.filters, [key]: !input.filters?.[key] } });
  return <>
    {FLOAT_FILTER_GROUPS.map(group => <fieldset key={group.title} className="min-w-0">
      <legend className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-text-muted)]">{group.title}</legend>
      {group.title === 'Access' && <LayerRow mark={MARKS.publicOnly} label={FLOAT_PUBLIC_ONLY_LABEL} on={input.publicOnly} onClick={() => onChange({ publicOnly: !input.publicOnly })} />}
      {group.filters.map(filter => <LayerRow key={filter.key} mark={MARKS[filter.key]} label={filter.label} on={Boolean(input.filters?.[filter.key])} onClick={() => toggle(filter.key)} />)}
    </fieldset>)}
  </>;
}

/**
 * The same groups and labels as the iOS Filters sheet.
 *
 * Desktop: an inline panel. The submit row (`children`) shares the Filters
 * row while the panel is closed and moves below it when open, so the button
 * that applies the filters always comes after them.
 *
 * Phone: a bottom sheet. Expanding inline pushed Find floats hundreds of
 * pixels down; the sheet keeps the form where it was, scrolls on its own,
 * and ends in a Find floats button that applies the choices and searches.
 *
 * Either way the choices are live form state (nothing to apply separately),
 * and a closed panel still names them in a one-line summary.
 */
export default function FloatFilters({ input, onChange, children }: {
  input: FloatSearchInput;
  onChange: (patch: Partial<FloatSearchInput>) => void;
  /** The submit row; repeated at the foot of the phone sheet. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const panel = useId();
  const sheetTitle = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selections = floatFilterSelections(input);
  const changed = floatFilterCount(input) > 0;
  const expanded = open || sheet;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (sheet && !node.open) node.showModal();
    if (!sheet && node.open) node.close();
    if (!sheet) return;
    // A modal dialog does not stop the page behind it from scrolling.
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Submitting the search from the sheet closes it; so does growing past a phone.
    const form = node.closest('form');
    const close = () => setSheet(false);
    const phone = window.matchMedia(PHONE);
    form?.addEventListener('submit', close);
    phone.addEventListener('change', close);
    return () => {
      root.style.overflow = overflow;
      form?.removeEventListener('submit', close);
      phone.removeEventListener('change', close);
    };
  }, [sheet]);

  function show() {
    if (window.matchMedia(PHONE).matches) setSheet(true);
    else setOpen(value => !value);
  }

  const reset = changed && <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[var(--color-text-link)] underline-offset-4 hover:underline"
    onClick={() => onChange({ filters: undefined, publicOnly: true })}>Reset filters</button>;

  return <div className="grid grid-cols-1 items-center gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:col-start-1 sm:row-start-1">
      <button ref={trigger} type="button" aria-expanded={expanded} aria-controls={sheet ? undefined : panel} onClick={show}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 aria-expanded:border-primary-500">
        <SlidersHorizontal size={16} aria-hidden="true" />Filters
        {selections.length > 0 && <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-500 px-2 text-xs text-white">{selections.length}<span className="sr-only"> selected</span></span>}
        <ChevronDown size={16} aria-hidden="true" className={`hidden transition-transform sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {!open && selections.length > 0 && <p className="min-w-0 text-sm text-[var(--color-text-secondary)]">{selections.join(' · ')}</p>}
      {open && reset}
    </div>
    <div id={panel} hidden={!open} className={`${open ? 'grid' : 'hidden'} gap-x-6 gap-y-4 rounded-lg border-2 border-primary-700 bg-[var(--color-surface)] px-3 py-2.5 shadow-md sm:col-span-2 md:grid-cols-3`}>
      {open && <Groups input={input} onChange={onChange} />}
    </div>
    <div className={`flex flex-wrap items-center justify-end gap-3 ${open ? 'sm:col-span-2' : 'sm:col-start-2 sm:row-start-1'}`}>{children}</div>

    <dialog ref={dialog} aria-labelledby={sheetTitle} onClose={() => { setSheet(false); trigger.current?.focus(); }}
      onClick={e => { if (e.target === e.currentTarget) setSheet(false); }}
      className="filter-sheet m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border-t-2 border-[var(--color-primary-700)] bg-[var(--color-surface)] p-0 text-[var(--color-text-primary)] backdrop:bg-black/40 open:flex">
      {sheet && <>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2">
          <h2 id={sheetTitle} className="text-lg font-semibold">Filters</h2>
          <div className="flex items-center">
            {reset}
            <button type="button" aria-label="Close filters" onClick={() => setSheet(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"><X size={20} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
          <Groups input={input} onChange={onChange} />
        </div>
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
      </>}
    </dialog>
  </div>;
}
