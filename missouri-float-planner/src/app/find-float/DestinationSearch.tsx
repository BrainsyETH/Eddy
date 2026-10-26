'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [places, setPlaces] = useState<FloatSearchPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useRef<HTMLDivElement>(null);
  const term = query?.trim() ?? '';
  const riverMatches = rivers.filter(r => r.name.toLowerCase().includes(term.toLowerCase()));

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
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, term]);

  function choose(destination: SearchDestination) {
    setQuery(null);
    setOpen(false);
    setPlaces([]);
    setStatus('idle');
    onChoose(destination);
    inputRef.current?.focus();
    // Focus above opens suggestions; close after returning focus to the field.
    setOpen(false);
  }

  return (
    <div onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <label htmlFor="float-destination" className="text-sm font-semibold">Town or river</label>
        <Button variant="ghost" size="sm" className="min-h-11" disabled={locating} onClick={() => { setQuery(null); setOpen(false); onLocate(); }}>
          <Navigation size={14} aria-hidden="true" />{locating ? 'Locating…' : selected === 'Your approximate location' ? 'Refresh location' : 'Use my location'}
        </Button>
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id="float-destination"
          type="search"
          className="input"
          placeholder="Search a town or river"
          autoComplete="off"
          maxLength={120}
          value={query ?? selected}
          aria-controls={open ? 'float-destinations' : undefined}
          onFocus={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value); setOpen(true); setPlaces([]); setStatus('idle'); onClear();
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            if (e.key === 'ArrowDown' || (e.key === 'Enter' && open)) {
              e.preventDefault();
              setOpen(true);
              suggestions.current?.querySelector('button')?.focus();
            }
          }}
        />
        {open && <div ref={suggestions} id="float-destinations" className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-soft-lg" onKeyDown={e => {
          if (e.key === 'Escape') { inputRef.current?.focus(); setOpen(false); }
        }}>
          <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Rivers</p>
          {riverMatches.map(r => <Button key={r.id} variant="ghost" className="w-full justify-start text-left" onClick={() => choose({ name: r.name, river: r.slug })}>
            <Waves size={16} className="shrink-0" aria-hidden="true" />{r.name}
          </Button>)}
          {riverMatches.length === 0 && <p className="p-2 text-sm text-[var(--color-text-secondary)]">{riversFailed ? 'River list unavailable. Try a town.' : 'No matching rivers.'}</p>}
          {term.length >= 2 && <>
            <p className="mt-2 border-t border-[var(--color-border)] px-2 pt-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Towns</p>
            <div role="status" className="text-sm text-[var(--color-text-secondary)]">
              {(status === 'loading' || status === 'idle') && <p className="p-2">Looking for towns…</p>}
              {status === 'error' && <p className="p-2">Town search is unavailable. Choose a river or use your location.</p>}
              {status === 'done' && !places.length && <p className="p-2">No towns found. Try adding a state.</p>}
            </div>
            {places.map(place => <Button key={place.id} variant="ghost" className="w-full justify-start text-left" onClick={() => choose({ name: place.name, near: place.near })}>
              <MapPin size={16} className="shrink-0" aria-hidden="true" />{place.name}
            </Button>)}
            {places.length > 0 && <p className="px-2 pt-2 text-xs text-[var(--color-text-secondary)]">Town search © <a href="https://www.mapbox.com/about/maps/" className="underline">Mapbox</a></p>}
          </>}
        </div>}
      </div>
    </div>
  );
}
