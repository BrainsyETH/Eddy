'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, Waves, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { RiverListItem } from '@/types/api';
import type { FloatSearchPlace } from '@shared/float-search';

export type SearchDestination = { name: string; river?: string; near?: FloatSearchPlace['near']; source?: 'current' | 'town' | 'access' };
type Option = SearchDestination & { key: string; locate?: boolean };

export default function DestinationSearch({ rivers, selected, locating, usingLocation, riversFailed, onChoose, onClear, onLocate }: {
  rivers: RiverListItem[];
  selected: string;
  locating: boolean;
  usingLocation: boolean;
  riversFailed: boolean;
  onChoose: (destination: SearchDestination) => void;
  onClear: () => void;
  onLocate: () => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [places, setPlaces] = useState<FloatSearchPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-destinations`;
  const term = query?.trim() ?? '';
  // Dam-regulated rivers cannot be duration-matched, so they are not offered.
  const riverMatches = rivers.filter(r => r.riverType !== 'dam_tailwater' && r.name.toLowerCase().includes(term.toLowerCase()));
  const riverOptions: Option[] = riverMatches.map(r => ({ key: `river:${r.id}`, name: r.name, river: r.slug }));
  const accessOptions: Option[] = places.filter(p => p.kind === 'access' && p.river).map(p => ({
    key: p.id, name: p.riverName ? `${p.name} · ${p.riverName}` : p.name, river: p.river, near: p.near, source: 'access',
  }));
  const townOptions: Option[] = places.filter(p => p.kind !== 'access').map(p => ({ key: `town:${p.id}`, name: p.name, near: p.near, source: 'town' }));
  // Before anything is typed, the first suggestion is your own location.
  const locateOptions: Option[] = term ? [] : [{ key: 'locate', name: usingLocation ? 'Refresh my location' : 'Use my location', locate: true }];
  const options = [...locateOptions, ...riverOptions, ...accessOptions, ...townOptions];
  const activeIndex = options.findIndex(option => option.key === activeKey);
  const activeId = open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    if (!open || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await fetch('/api/float-search/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Town lookup unavailable');
        const data: { places: FloatSearchPlace[] } = await response.json();
        if (!controller.signal.aborted) { setPlaces(data.places); setStatus('done'); }
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, term]);

  function choose(option: Option) {
    if (option.locate) { close(); onLocate(); return; }
    setQuery(null);
    setActiveKey(null);
    setPlaces([]);
    setStatus('idle');
    onChoose({ name: option.name, river: option.river, near: option.near, source: option.source });
    inputRef.current?.focus();
    // Focus above opens suggestions; close after returning focus to the field.
    setOpen(false);
  }

  // An unfinished edit never clears the current choice: closing restores it.
  function close() { setOpen(false); setActiveKey(null); setQuery(null); }

  function renderOption(option: Option, index: number) {
    const Icon = option.locate ? Navigation : option.source === 'town' ? MapPin : Waves;
    return <Button key={option.key} id={`${id}-option-${index}`} role="option" tabIndex={-1}
      aria-selected={activeKey === option.key} variant="ghost"
      className={`w-full !justify-start text-left ${activeKey === option.key ? 'bg-[var(--color-surface-hover)] outline outline-2 -outline-offset-2 outline-primary-500' : ''}`}
      onMouseDown={e => e.preventDefault()} onClick={() => choose(option)}>
      <Icon size={16} className="shrink-0" aria-hidden="true" />{option.name}
    </Button>;
  }

  const group = (label: string, items: Option[], offset: number, first = false) => items.length > 0 && <div role="group" aria-labelledby={`${id}-${label}`}>
    <p id={`${id}-${label}`} className={`px-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] ${first ? 'py-1' : 'mt-2 border-t border-[var(--color-border)] pt-3'}`}>{label}</p>
    {items.map((option, index) => renderOption(option, index + offset))}
  </div>;

  const clearable = Boolean(selected && query === null);
  const trailingButton = 'flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500 disabled:cursor-wait';

  return (
    <div className="min-w-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <label htmlFor="float-destination" className="mb-2 block text-sm font-semibold">Where</label>
      <div className="relative">
        <input
          ref={inputRef}
          id="float-destination"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-activedescendant={activeId}
          className={`input ${clearable ? 'pr-24' : 'pr-12'}`}
          placeholder="River, access, or town"
          autoComplete="off"
          maxLength={120}
          value={query ?? selected}
          aria-controls={open ? listId : undefined}
          onFocus={() => { setOpen(true); setActiveKey(null); }}
          onClick={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value); setOpen(true); setActiveKey(null); setPlaces([]); setStatus('idle');
          }}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            if (e.key === 'Tab') close();
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              const index = activeIndex < 0 ? (e.key === 'ArrowDown' ? 0 : options.length - 1)
                : (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
              setActiveKey(options[index]?.key ?? null);
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              // Enter takes the highlighted suggestion, or the top one for a typed search.
              const option = options[activeIndex] ?? (term ? options[0] : undefined);
              if (option) choose(option);
            }
            // Leave native cursor movement and text editing intact.
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              setActiveKey(null);
            }
          }}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {clearable && <><button type="button" aria-label="Clear destination" title="Clear"
            className={trailingButton}
            onClick={() => { onClear(); inputRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>
          <span aria-hidden="true" className="h-6 w-px bg-[var(--color-border)]" /></>}
          <button type="button" disabled={locating}
            aria-label={locating ? 'Finding your location' : usingLocation ? 'Refresh my location' : 'Use my location'}
            title={usingLocation ? 'Refresh my location' : 'Use my location'}
            className={`${trailingButton} ${usingLocation ? 'text-[var(--color-text-link)]' : ''}`}
            onClick={() => { close(); onLocate(); }}>
            {locating ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Navigation size={18} aria-hidden="true" />}
          </button>
        </div>
        {open && <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-soft-lg">
          <div id={listId} role="listbox" aria-label="Destinations">
            {locateOptions.map((option, index) => renderOption(option, index))}
            {group('Rivers', riverOptions, locateOptions.length, !locateOptions.length)}
            {group('Accesses', accessOptions, locateOptions.length + riverOptions.length, !locateOptions.length && !riverOptions.length)}
            {group('Towns', townOptions, locateOptions.length + riverOptions.length + accessOptions.length, !locateOptions.length && !riverOptions.length && !accessOptions.length)}
          </div>
          <p role="status" className="sr-only">{options.length} {options.length === 1 ? 'suggestion' : 'suggestions'} available.</p>
          {riverMatches.length === 0 && term.length < 2 && <p className="p-2 text-sm text-[var(--color-text-secondary)]">{riversFailed ? 'River list unavailable. Try a town.' : 'No matching rivers.'}</p>}
          {term.length >= 2 && <>
            <div role="status" className="text-sm text-[var(--color-text-secondary)]">
              {(status === 'loading' || status === 'idle') && <p className="p-2">Searching…</p>}
              {status === 'error' && !riverMatches.length && <p className="p-2">Town search is unavailable. Choose a river or use your location.</p>}
              {status === 'done' && !options.length && <p className="p-2">No matches. Try adding a state.</p>}
            </div>
            {townOptions.length > 0 && <p className="px-2 pt-2 text-xs text-[var(--color-text-secondary)]">Town search © <a href="https://www.mapbox.com/about/maps/" tabIndex={-1} className="underline">Mapbox</a></p>}
          </>}
        </div>}
      </div>
    </div>
  );
}
