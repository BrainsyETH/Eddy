'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import DamListCard from '@/components/dam/DamListCard';
import { stateName } from '@/lib/navigation/states';
import { parseDirectoryFilters, type DirectoryDamGroup } from '@/lib/data/dam-directory';

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').trim();
}

export default function DamDirectory({
  groups,
  renderedAt,
  initialQuery = '',
  initialState = 'all',
}: {
  groups: DirectoryDamGroup[];
  renderedAt: number;
  initialQuery?: string;
  initialState?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const interval = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);


  function filter(nextQuery: string, nextState: string) {
    setQuery(nextQuery);
    setState(nextState);
    const params = new URLSearchParams(window.location.search);
    if (nextQuery.trim()) params.set('q', nextQuery);
    else params.delete('q');
    if (nextState !== 'all') params.set('state', nextState);
    else params.delete('state');
    const search = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (search ? '?' + search : '') + window.location.hash);
  }

  const states = useMemo(() => {
    const seen = new Set<string>();
    for (const group of groups) for (const dam of group.dams) seen.add(dam.state);
    return [...seen].sort((a, b) => {
      if (a === 'MO') return -1;
      if (b === 'MO') return 1;
      if (a === 'AR') return -1;
      if (b === 'AR') return 1;
      return stateName(a).localeCompare(stateName(b));
    });
  }, [groups]);

  // Preserve existing /dams?q=...&state=... links, including Back/Forward, by
  // the same rule the page applies on the server (parseDirectoryFilters).
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const next = parseDirectoryFilters({ q: params.get('q'), state: params.get('state') }, states);
      setQuery(next.query);
      setState(next.state);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [states]);

  const filtered = useMemo(() => {
    const term = normalize(query);
    return groups.map(group => ({
      ...group,
      dams: group.dams.filter(dam => {
        if (state !== 'all' && dam.state !== state) return false;
        return !term || normalize([dam.name, dam.lakeName ?? '', dam.state, stateName(dam.state)].join(' ')).includes(term);
      }),
    })).filter(group => group.dams.length > 0);
  }, [groups, query, state]);

  const total = groups.reduce((sum, group) => sum + group.dams.length, 0);
  const count = filtered.reduce((sum, group) => sum + group.dams.length, 0);

  return (
    <section id="all-dams" aria-labelledby="all-dams-heading" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="all-dams-heading" className="font-heading text-2xl font-bold tracking-tight text-primary-900">All dams</h2>
        <span role="status" aria-live="polite" className="text-sm text-neutral-600">{count} of {total} dams</span>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-primary-700" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search dams and lakes"
            placeholder="Search dams and lakes"
            value={query}
            onChange={event => filter(event.target.value, state)}
            className="h-11 w-full rounded-md border-2 border-neutral-300 bg-white pl-11 pr-11 text-base text-neutral-900 placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-100"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => filter('', state)} className="absolute right-1 top-0.5 flex size-10 items-center justify-center text-neutral-600 hover:text-primary-800">
              <X className="size-4" />
            </button>
          )}
        </div>
        <select
          value={state}
          onChange={event => filter(query, event.target.value)}
          aria-label="Filter dams by state"
          className="min-h-11 rounded-md border-2 border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-100 sm:w-52"
        >
          <option value="all">All states</option>
          {states.map(code => <option key={code} value={code}>{stateName(code)}</option>)}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-9">
          {filtered.map(group => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="mb-3 border-b border-neutral-200 pb-2 font-heading text-lg font-bold text-primary-900">{group.label}</h3>
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                {group.dams.map(dam => (
                  <DamListCard key={dam.id} dam={dam} now={now} href={'/dams/' + dam.id} showLakeLevel />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-9 text-center">
          <p className="text-sm text-neutral-700">No matching dams.</p>
          <button type="button" className="mt-2 min-h-11 font-semibold text-primary-800 underline underline-offset-4" onClick={() => filter('', 'all')}>
            Clear search and filters
          </button>
        </div>
      )}
      <p className="mt-5 max-w-3xl text-xs leading-5 text-neutral-600">
        Charts show posted generation plans, not live flow or safe wading hours. The schedule is for the dam; water reaches downstream later.
      </p>
    </section>
  );
}
