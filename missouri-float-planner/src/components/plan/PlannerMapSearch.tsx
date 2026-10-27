'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, MapPin, Search, Waves, X } from 'lucide-react';
import type { RiverListItem } from '@/types/api';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';
import { matchesMapSearch } from '@/lib/planner-map-catalog';
import type { ConditionNetworkFeatureProps } from '@/hooks/useStatewideConditions';
import { conditionDef } from '@shared/condition-system';

interface Props {
  rivers: RiverListItem[];
  places: PlannerMapPlace[];
  currentSlug: string | null;
  conditions: ReadonlyMap<string, ConditionNetworkFeatureProps>;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onRiver: (slug: string | null) => void;
  onPlace: (place: PlannerMapPlace) => void;
  /** Compact controls (weather, filters) shown at the end of the input row. */
  actions?: ReactNode;
  /** Rivers only: no access-point results or category tabs (mobile picker). */
  riversOnly?: boolean;
}

export default function PlannerMapSearch({ rivers, places, currentSlug, conditions, loading, failed, onRetry, onRiver, onPlace, actions, riversOnly = false }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'all' | 'rivers' | 'access'>(riversOnly ? 'rivers' : 'all');
  const [active, setActive] = useState(-1);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = useMemo(() => [
    ...(kind === 'access' ? [] : rivers.filter(r => matchesMapSearch(query, r.name, r.region, r.slug))
      .map(r => ({ key: `river:${r.id}`, name: r.name, subtitle: r.region ?? 'River', river: r, place: null }))),
    ...(kind === 'rivers' ? [] : places.filter(p => matchesMapSearch(query, p.name, p.riverName))
      .map(p => ({ key: `access:${p.riverId}:${p.id}`, name: p.name, subtitle: p.riverName, river: null, place: p }))),
  ], [kind, rivers, places, query]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const select = (index: number) => {
    const result = results[index];
    if (!result) return;
    if (result.place) onPlace(result.place);
    else if (result.river) onRiver(result.river.slug);
    input.current?.focus();
    setOpen(false);
    setQuery('');
    setActive(-1);
  };
  const current = rivers.find(r => r.slug === currentSlug);

  return <div ref={panel} className="planner-search relative z-40 shrink-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    {/* No overflow clipping: the action popovers (weather, filters) open
        below this card. */}
    <div className="planner-glass rounded-2xl">
      <div className="flex items-center gap-2 px-3.5 py-3">
        <Search size={19} className="shrink-0 text-primary-600" aria-hidden="true" />
        <input ref={input} role="combobox" aria-label={riversOnly ? 'Search rivers' : 'Search rivers and access points'} aria-autocomplete="list"
          aria-expanded={open} aria-controls={open ? `${id}-results` : undefined}
          aria-activedescendant={open && active >= 0 && results[active] ? `${id}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
          placeholder={riversOnly ? 'Search rivers' : actions ? 'Search rivers & access' : 'Search rivers & access points'} value={query}
          onFocus={() => { setOpen(true); setActive(-1); }} onClick={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setOpen(true);
              setActive(value => !results.length ? -1 : value < 0
                ? (event.key === 'ArrowDown' ? 0 : results.length - 1)
                : (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            }
            if (event.key === 'Enter' && open && active >= 0) { event.preventDefault(); select(active); }
          }} />
        {query && <button type="button" aria-label="Clear search" className="rounded-lg p-1 text-neutral-600 hover:bg-neutral-100"
          onClick={() => { setQuery(''); setActive(-1); input.current?.focus(); }}><X size={16} /></button>}
        {/* Reaching a tool closes the results so two popovers never stack:
            focus covers keyboard (Tab) and most clicks; pointerdown covers
            browsers that don't focus a clicked button (Safari). */}
        {actions && <div className="flex shrink-0 items-center gap-0.5 border-l border-neutral-200/70 pl-1.5"
          onPointerDown={() => setOpen(false)} onFocus={() => setOpen(false)}>{actions}</div>}
      </div>
      {current && !open && <div className="flex items-center justify-between gap-2 border-t border-neutral-200/60 px-3.5 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-primary-800"><Waves size={15} /><span className="truncate">{current.name}</span></span>
        <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs text-primary-700 hover:bg-primary-50" onClick={() => onRiver(null)}>All rivers</button>
      </div>}
    </div>
    {open && <div className="planner-glass absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl">
      {!riversOnly && <div className="flex gap-1 border-b border-neutral-200/60 p-2" aria-label="Search categories">
        {(['all', 'rivers', 'access'] as const).map(value => <button type="button" key={value} aria-pressed={kind === value}
          className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${kind === value ? 'bg-primary-700 text-white' : 'text-neutral-600 hover:bg-primary-50'}`}
          onClick={() => { setKind(value); setActive(-1); }}>{value === 'all' ? 'All' : value === 'rivers' ? 'Rivers' : 'Access points'}</button>)}
      </div>}
      <div id={`${id}-results`} role="listbox" aria-label="Places" className="max-h-[min(360px,45vh)] overflow-y-auto overscroll-contain p-1.5">
        {results.map((result, index) => {
          const condition = result.river ? conditions.get(result.river.slug) : undefined;
          return <div key={result.key} id={`${id}-${index}`} role="option" aria-selected={active === index}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${active === index ? 'bg-primary-100' : 'hover:bg-primary-50/80'}`}
            onMouseDown={event => event.preventDefault()} onClick={() => select(index)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-100/70 text-primary-700">
              {result.river ? <Waves size={17} /> : <MapPin size={17} />}
            </span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-neutral-900">{result.name}</span>
              <span className="mt-0.5 block truncate text-xs text-neutral-600">{condition ? conditionDef(condition.code).label : result.subtitle}</span></span>
            {condition ? <span className="h-1.5 w-6 shrink-0 rounded-full" style={{ backgroundColor: condition.color }} /> : <ArrowUpRight size={15} className="text-neutral-400" />}
          </div>;
        })}
        {!results.length && <p className="p-5 text-center text-sm text-neutral-600">{loading ? 'Loading places…' : riversOnly ? 'No matches. Try a river name.' : 'No matches. Try a river or access name.'}</p>}
      </div>
      {kind !== 'rivers' && (loading || failed) && <div className="border-t border-neutral-200/60 px-3 py-2 text-xs text-neutral-600" role="status">
        {failed ? <>Access points couldn’t load. <button type="button" onClick={onRetry} className="font-semibold text-primary-700 underline">Try again</button></> : 'Loading access points…'}
      </div>}
      <p className="border-t border-neutral-200/60 px-3 py-2 text-[11px] text-neutral-500">{riversOnly
        ? `${results.length} rivers · Colored by today’s conditions`
        : `${results.length} places · Choose a river or explore an access point`}</p>
    </div>}
  </div>;
}
