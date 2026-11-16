'use client';

import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';

export interface GuideDirectoryEntry { slug: string; search: string; state: string | null; card: ReactNode }

/** Cards are rendered on the server and all links exist before hydration. */
export default function GuideDirectory({ entries }: { entries: GuideDirectoryEntry[] }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = entries.filter(entry => (!state || entry.state === state) && entry.search.toLocaleLowerCase().includes(needle));
  const shown = new Set(visible.map(entry => entry.slug));
  return <>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-sm font-semibold text-primary-800">
        Find a river or guide
        <span className="relative mt-2 block">
          <Search aria-hidden className="absolute left-3 top-3 h-5 w-5 text-primary-600" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="River, town, or place…"
            className="min-h-11 w-full rounded-lg border-2 border-primary-700 bg-white py-2 pl-10 pr-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500" />
        </span>
      </label>
      <label className="text-sm font-semibold text-primary-800">State
        <select value={state} onChange={event => setState(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border-2 border-primary-700 bg-white px-3 py-2 sm:w-44">
          <option value="">All states</option><option value="MO">Missouri</option><option value="AR">Arkansas</option>
        </select>
      </label>
    </div>
    <p role="status" className="mb-4 text-sm text-neutral-600">{visible.length} {visible.length === 1 ? 'guide' : 'guides'}</p>
    {!visible.length && <div className="mb-6 rounded-lg border border-neutral-300 bg-white p-5">
      <p>No guides match that search.</p>
      <button type="button" onClick={() => { setQuery(''); setState(''); }} className="mt-2 min-h-11 font-semibold text-primary-700 underline">Clear search and filters</button>
    </div>}
    <div className="grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
      {entries.map(entry => <div key={entry.slug} hidden={!shown.has(entry.slug)} className="[&>article]:h-full">{entry.card}</div>)}
    </div>
  </>;
}
