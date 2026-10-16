'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchableDamGroup {
  label: string;
  dams: { id: string; searchText: string; content: ReactNode }[];
}

/** Filter server-rendered cards locally; typing never fetches dam readings. */
export default function DamSearchList({ groups }: { groups: SearchableDamGroup[] }) {
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Accept input only once handlers and the restored filter are ready.
    const saved = window.history.state?.eddyDamSearch;
    if (typeof saved === 'string') setQuery(saved);
    setReady(true);
  }, []);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = groups.map(group => ({
    ...group,
    dams: group.dams.filter(dam => terms.every(term => dam.searchText.toLowerCase().includes(term))),
  })).filter(group => group.dams.length > 0);
  const total = groups.reduce((sum, group) => sum + group.dams.length, 0);
  const count = filtered.reduce((sum, group) => sum + group.dams.length, 0);

  function search(value: string) {
    setQuery(value);
    // Keep this history entry's filter when returning from a dam. No URL
    // change, extra history entries, or server requests on each keystroke.
    window.history.replaceState({ ...window.history.state, eddyDamSearch: value }, '');
  }

  function clear() {
    search('');
    input.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-3.5 size-5 text-neutral-500" aria-hidden="true" />
          <label htmlFor="dam-search" className="sr-only">Search lakes and dams</label>
          <input
            ref={input}
            id="dam-search"
            type="search"
            disabled={!ready}
            value={query}
            onChange={event => search(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') clear(); }}
            placeholder="Search dam, lake, or state"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-neutral-300 bg-white pl-11 pr-12 text-base text-neutral-900 placeholder:text-neutral-500 focus:border-primary-600 focus:outline-2 focus:outline-primary-600 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && <button type="button" onClick={clear} aria-label="Clear search" className="absolute right-0.5 top-0.5 inline-flex size-11 items-center justify-center rounded-xl text-neutral-500 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-primary-600"><X className="size-5" aria-hidden="true" /></button>}
        </div>
        <p role="status" className="text-sm text-neutral-500">{terms.length > 0 ? `${count} of ${total}` : total} {total === 1 ? 'dam' : 'dams'}</p>
      </div>

      {count === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-600">
          <p className="font-semibold text-neutral-900">No dams found.</p>
          <p className="mt-1 text-sm">Try another dam, lake, or state.</p>
          <button type="button" onClick={clear} className="mt-3 min-h-11 rounded-lg px-3 font-medium text-primary-800 hover:bg-primary-50">Show all dams</button>
        </div>
      )}
      {filtered.map(group => (
        <section key={group.label} className="mb-10">
          <h2 className="mb-3 text-2xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{group.label}</h2>
          <div className="grid gap-4 md:grid-cols-2">{group.dams.map(dam => <div key={dam.id} className="min-w-0">{dam.content}</div>)}</div>
        </section>
      ))}
    </>
  );
}
