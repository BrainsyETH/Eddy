'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, X } from 'lucide-react';
import { readingStaleness, relativeAgeShort } from '@shared/dam-schedule-copy';
import type { DirectoryDam, DirectoryDamGroup, DirectoryReading } from '@/lib/data/dam-directory';

const MISSING = '—';

function age(reading: DirectoryReading | null, now: number): string | null {
  return reading ? relativeAgeShort(reading.at, now) : null;
}

function readingCopy(reading: DirectoryReading | null, unit: string, now: number, digits = 0) {
  if (!reading) return { value: MISSING, detail: 'Not available', old: false };
  const value = reading.value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return {
    value: value + ' ' + unit,
    detail: [reading.dailyMean ? 'Daily average' : null, age(reading, now)].filter(Boolean).join(' · '),
    old: readingStaleness(reading.at, now) !== 'fresh',
  };
}

function generationCopy(dam: DirectoryDam, now: number) {
  if (!dam.hasTurbines) return { label: 'No powerhouse', current: false };
  if (!dam.generation || readingStaleness(dam.generation.at, now) !== 'fresh') {
    return { label: 'Not measured', current: false };
  }
  return {
    label: dam.generation.kind === 'generating' ? 'Generating' : dam.generation.kind === 'minimum-flow' ? 'Minimum flow' : 'Not generating',
    current: true,
  };
}

function DamRow({ dam, now }: { dam: DirectoryDam; now: number }) {
  const pool = readingCopy(dam.lakeLevel, 'ft', now, 2);
  const release = readingCopy(dam.release, 'cfs', now);
  const generating = generationCopy(dam, now);
  const url = '/dams/' + dam.id;
  const next = dam.nextChange ?? 'No hourly schedule';

  return (
    <li className="border-t border-neutral-200 first:border-t-0">
      <div className="hidden grid-cols-[minmax(170px,1.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(116px,1fr)_minmax(190px,1.7fr)] items-center gap-x-4 px-4 py-3.5 md:grid lg:px-5">
        <div className="min-w-0">
          <Link href={url} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600">
            <span className="min-w-0">{dam.name}</span><ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
          {dam.lakeName && <p className="text-xs text-neutral-600">{dam.lakeName}</p>}
        </div>
        <div className="min-w-0">
          <p className={pool.old ? 'font-mono text-sm tabular-nums text-neutral-600' : 'font-mono text-sm tabular-nums text-neutral-900'}>{pool.value}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{pool.detail}</p>
        </div>
        <div className="min-w-0">
          <p className={release.old ? 'font-mono text-sm tabular-nums text-neutral-600' : 'font-mono text-sm tabular-nums text-neutral-900'}>{release.value}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{release.detail}</p>
        </div>
        <p className={generating.current ? 'text-sm font-medium text-primary-800' : 'text-sm text-neutral-600'}>{generating.label}</p>
        <div className="min-w-0">
          <p className="text-sm text-neutral-800">{next}</p>
          {dam.scheduleStale && <p className="mt-0.5 text-xs text-neutral-600">Schedule may be outdated</p>}
        </div>
      </div>
      <Link href={url} className="flex min-h-16 items-start justify-between gap-3 px-4 py-3.5 hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-600 md:hidden">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900">{dam.name}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{dam.lakeName ?? dam.state}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            <span><span className="text-neutral-600">Release </span><span className="font-mono tabular-nums text-primary-800">{release.value}</span>{dam.release?.dailyMean ? <span className="text-xs text-neutral-600"> avg</span> : null}</span>
            <span className={generating.current ? 'font-medium text-primary-800' : 'text-neutral-600'}>{generating.label}</span>
          </div>
          <p className="mt-1.5 text-xs text-neutral-600">Lake {pool.value} <span aria-hidden="true">·</span> {next}</p>
          {dam.scheduleStale && <p className="mt-1 text-xs text-neutral-600">Schedule may be outdated</p>}
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-primary-700" aria-hidden="true" />
      </Link>
    </li>
  );
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export default function DamDirectory({ groups, renderedAt }: { groups: DirectoryDamGroup[]; renderedAt: number }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const stateGroups = useMemo(() => groups.filter(group => group.label !== 'Arkansas River locks & dams'), [groups]);
  const filtered = useMemo(() => {
    const term = normalized(query);
    return groups.map(group => ({
      ...group,
      dams: group.dams.filter(dam => {
        if (state !== 'all' && dam.state !== state) return false;
        return !term || normalized([dam.name, dam.lakeName ?? '', dam.state].join(' ')).includes(term);
      }),
    })).filter(group => group.dams.length > 0);
  }, [groups, query, state]);
  const count = filtered.reduce((sum, group) => sum + group.dams.length, 0);
  const reset = () => { setQuery(''); setState('all'); };

  return <section id="all-dams" aria-labelledby="all-dams-heading" className="scroll-mt-24">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="all-dams-heading" className="font-heading text-2xl font-bold tracking-tight text-primary-900">All dams</h2>
      <span role="status" aria-live="polite" className="text-sm text-neutral-600">{count} {count === 1 ? 'dam' : 'dams'}</span>
    </div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-primary-700" aria-hidden="true" />
        <input type="search" aria-label="Search dams and lakes" placeholder="Search dams and lakes"
          value={query} onChange={e => setQuery(e.target.value)} className="h-11 w-full rounded-md border-2 border-neutral-300 bg-white pl-11 pr-11 text-base text-neutral-900 placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-100" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-1 top-0.5 flex size-10 items-center justify-center text-neutral-600 hover:text-primary-800"><X className="size-4" /></button>}
      </div>
      <select value={state} onChange={e => setState(e.target.value)} aria-label="Filter dams by state" className="min-h-11 rounded-md border-2 border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-100 sm:w-52">
        <option value="all">All states</option>
        {stateGroups.map(group => {
          const sample = group.dams[0];
          return <option key={group.label} value={sample.state}>{group.label}</option>;
        })}
      </select>
    </div>
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div aria-hidden="true" className="hidden grid-cols-[minmax(170px,1.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(116px,1fr)_minmax(190px,1.7fr)] gap-x-4 border-b border-neutral-200 bg-secondary-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 md:grid lg:px-5">
        <span>Dam / lake</span><span>Lake level</span><span>Release</span><span>Generation</span><span>Next scheduled change</span>
      </div>
      {filtered.map(group => <section key={group.label} aria-label={group.label}>
        <h3 className="border-y border-neutral-200 bg-neutral-50 px-4 py-2.5 font-heading text-base font-bold text-primary-900 first:border-t-0 lg:px-5">{group.label}</h3>
        <ul>{group.dams.map(dam => <DamRow key={dam.id} dam={dam} now={now} />)}</ul>
      </section>)}
      {count === 0 && <div className="px-5 py-9 text-center">
        <p className="text-sm text-neutral-700">No matching dams.</p>
        <button type="button" className="mt-2 min-h-11 font-semibold text-primary-800 underline underline-offset-4" onClick={reset}>Clear search and filters</button>
      </div>}
    </div>
    <p className="mt-3 text-xs leading-5 text-neutral-600">Readings show their observation age. Generation status uses recent turbine measurements, not the posted schedule. Scheduled times are at the dam; water reaches downstream areas later.</p>
  </section>;
}
