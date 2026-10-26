'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Navigation, Waves } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { RiverListItem } from '@/types/api';
import type { FloatSearchPlace } from '@shared/float-search';

export type SearchDestination = { name: string; river?: string; near?: FloatSearchPlace['near'] };

export default function DestinationSearch({ rivers, selected, locating, riversFailed, onChoose, onClear, onLocate }: {
  rivers: RiverListItem[];
  selected: string;
  locating: boolean;
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
  const riverMatches = rivers.filter(r => r.name.toLowerCase().includes(term.toLowerCase()));
  const riverOptions = riverMatches.map(r => ({ key: `river:${r.id}`, name: r.name, river: r.slug }));
  const townOptions = places.map(place => ({ key: `town:${place.id}`, name: place.name, near: place.near }));
  const options = [...riverOptions, ...townOptions];
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
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, term]);

  function choose(destination: SearchDestination) {
    setQuery(null);
    setActiveKey(null);
    setPlaces([]);
    setStatus('idle');
    onChoose(destination);
    inputRef.current?.focus();
    // Focus above opens suggestions; close after returning focus to the field.
    setOpen(false);
  }

  function close() { setOpen(false); setActiveKey(null); }

  function renderOption(option: SearchDestination & { key: string }, index: number) {
    return <Button key={option.key} id={`${id}-option-${index}`} role="option" tabIndex={-1}
      aria-selected={activeKey === option.key} variant="ghost"
      className={`w-full justify-start text-left ${activeKey === option.key ? 'bg-[var(--color-surface-hover)] outline outline-2 -outline-offset-2 outline-primary-500' : ''}`}
      onMouseDown={e => e.preventDefault()} onClick={() => choose(option)}>
      {option.river ? <Waves size={16} className="shrink-0" aria-hidden="true" /> : <MapPin size={16} className="shrink-0" aria-hidden="true" />}{option.name}
    </Button>;
  }

  return (
    <div onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <label htmlFor="float-destination" className="text-sm font-semibold">Town or river</label>
        <Button variant="ghost" size="sm" className="min-h-11" disabled={locating} onClick={() => { setQuery(null); close(); onLocate(); }}>
          <Navigation size={14} aria-hidden="true" />{locating ? 'Locating…' : selected === 'Your approximate location' ? 'Refresh location' : 'Use my location'}
        </Button>
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id="float-destination"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-activedescendant={activeId}
          className="input"
          placeholder="Search a town or river"
          autoComplete="off"
          maxLength={120}
          value={query ?? selected}
          aria-controls={open ? listId : undefined}
          onFocus={() => { setOpen(true); setActiveKey(null); }}
          onClick={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value); setOpen(true); setActiveKey(null); setPlaces([]); setStatus('idle'); onClear();
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
              if (options[activeIndex]) choose(options[activeIndex]);
            }
            // Leave native cursor movement and text editing intact.
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              setActiveKey(null);
            }
          }}
        />
        {open && <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-soft-lg">
          <div id={listId} role="listbox" aria-label="Destinations">
            {riverOptions.length > 0 && <div role="group" aria-labelledby={`${id}-rivers`}>
              <p id={`${id}-rivers`} className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Rivers</p>
              {riverOptions.map(renderOption)}
            </div>}
            {townOptions.length > 0 && <div role="group" aria-labelledby={`${id}-towns`}>
              <p id={`${id}-towns`} className="mt-2 border-t border-[var(--color-border)] px-2 pt-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Towns</p>
              {townOptions.map((option, index) => renderOption(option, index + riverOptions.length))}
            </div>}
          </div>
          <p role="status" className="sr-only">{options.length} {options.length === 1 ? 'suggestion' : 'suggestions'} available.</p>
          {riverMatches.length === 0 && <p className="p-2 text-sm text-[var(--color-text-secondary)]">{riversFailed ? 'River list unavailable. Try a town.' : 'No matching rivers.'}</p>}
          {term.length >= 2 && <>
            <div role="status" className="text-sm text-[var(--color-text-secondary)]">
              {(status === 'loading' || status === 'idle') && <p className="p-2">Looking for towns…</p>}
              {status === 'error' && <p className="p-2">Town search is unavailable. Choose a river or use your location.</p>}
              {status === 'done' && !places.length && <p className="p-2">No towns found. Try adding a state.</p>}
            </div>
            {places.length > 0 && <p className="px-2 pt-2 text-xs text-[var(--color-text-secondary)]">Town search © <a href="https://www.mapbox.com/about/maps/" tabIndex={-1} className="underline">Mapbox</a></p>}
          </>}
        </div>}
      </div>
    </div>
  );
}
