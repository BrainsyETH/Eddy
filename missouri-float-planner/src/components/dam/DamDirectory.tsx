'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, X } from 'lucide-react';
import { stateName } from '@/lib/navigation/states';
import { readingStaleness, relativeAgeShort } from '@shared/dam-schedule-copy';
import { scheduleOutlook, scheduledChangeSummary } from '@shared/dam-generation';
import type { DirectoryDam, DirectoryDamGroup, DirectoryReading } from '@/lib/data/dam-directory';

function readingCopy(reading: DirectoryReading | null, unit: string, now: number, digits = 0) {
  if (!reading) return { value: '—', detail: 'Not available', old: false };
  const value = reading.value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return {
    value: value + ' ' + unit,
    detail: [reading.dailyMean ? 'Daily average' : null, relativeAgeShort(reading.at, now)].filter(Boolean).join(' · '),
    old: readingStaleness(reading.at, now) !== 'fresh',
  };
}

function generationCopy(dam: DirectoryDam, now: number) {
  if (!dam.hasTurbines) return { label: 'No powerhouse', current: false };
  if (!dam.generation) return { label: 'Not measured', current: false };
  if (readingStaleness(dam.generation.at, now) !== 'fresh') return { label: 'No recent reading', current: false };
  return {
    label: dam.generation.kind === 'generating' ? 'Generating' : dam.generation.kind === 'minimum-flow' ? 'Minimum flow' : 'Not generating',
    current: true,
  };
}

function rowFacts(dam: DirectoryDam, now: number) {
  const pool = readingCopy(dam.lakeLevel, 'ft', now, 2);
  const release = readingCopy(dam.release, 'cfs', now);
  const generating = generationCopy(dam, now);
  const outlook = dam.hasHourlySchedule ? scheduleOutlook(dam.schedule, dam.generationReference, now) : null;
  const next = !dam.hasTurbines || !dam.hasHourlySchedule
    ? 'No hourly schedule'
    : !outlook ? 'Schedule unavailable'
      : outlook.move ? (scheduledChangeSummary(dam.schedule, dam.generationReference, now) ?? 'Schedule unavailable')
        : 'No change in posted hours';
  return { pool, release, generating, next, scheduleStale: Boolean(outlook?.stale) };
}

function DesktopRow({ dam, now }: { dam: DirectoryDam; now: number }) {
  const { pool, release, generating, next, scheduleStale } = rowFacts(dam, now);
  return <tr className="border-t border-neutral-200">
    <th scope="row" className="px-4 py-3 text-left align-top font-normal">
      <Link href={'/dams/' + dam.id} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600">
        {dam.name}<ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
      {dam.lakeName && <p className="text-xs text-neutral-600">{dam.lakeName}</p>}
    </th>
    <td className="px-3 py-3 align-top">
      <p className={pool.old ? 'font-mono text-sm tabular-nums text-neutral-600' : 'font-mono text-sm tabular-nums text-neutral-900'}>{pool.value}</p>
      <p className="mt-0.5 text-xs text-neutral-600">{pool.detail}</p>
    </td>
    <td className="px-3 py-3 align-top">
      <p className={release.old ? 'font-mono text-sm tabular-nums text-neutral-600' : 'font-mono text-sm tabular-nums text-neutral-900'}>{release.value}</p>
      <p className="mt-0.5 text-xs text-neutral-600">{release.detail}</p>
    </td>
    <td className="px-3 py-3 align-top">
      <p className={generating.current ? 'text-sm font-medium text-primary-800' : 'text-sm text-neutral-600'}>{generating.label}</p>
    </td>
    <td className="px-4 py-3 align-top">
      <p className="text-sm text-neutral-800">{next}</p>
      {scheduleStale && <p className="mt-0.5 text-xs text-neutral-600">Schedule may be outdated</p>}
    </td>
  </tr>;
}

function MobileRow({ dam, now }: { dam: DirectoryDam; now: number }) {
  const { pool, release, generating, next, scheduleStale } = rowFacts(dam, now);
  return <li className="border-t border-neutral-200 first:border-t-0">
    <Link href={'/dams/' + dam.id} className="flex min-h-16 items-start justify-between gap-3 px-4 py-3.5 hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-600">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-neutral-900">{dam.name}</p>
        <p className="mt-0.5 text-xs text-neutral-600">{dam.lakeName ?? dam.state}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          <span><span className="text-neutral-600">Release </span><span className={release.old ? 'font-mono tabular-nums text-neutral-600' : 'font-mono tabular-nums text-primary-800'}>{release.value}</span>{dam.release?.dailyMean ? <span className="text-xs text-neutral-600"> avg</span> : null}</span>
          <span className={generating.current ? 'font-medium text-primary-800' : 'text-neutral-600'}>{generating.label}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-neutral-600">Lake {pool.value} <span aria-hidden="true">·</span> {next}</p>
        {scheduleStale && <p className="mt-1 text-xs text-neutral-600">Schedule may be outdated</p>}
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-primary-700" aria-hidden="true" />
    </Link>
  </li>;
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

  const states = useMemo(() => {
    const all = groups.flatMap(group => group.dams);
    return [...new Set(all.map(dam => dam.state))];
  }, [groups]);

  const filtered = useMemo(() => {
    const term = normalized(query);
    return groups.map(group => ({
      ...group,
      dams: group.dams.filter(dam =>
        (state === 'all' || dam.state === state) &&
        (!term || normalized([dam.name, dam.lakeName ?? '', dam.state].join(' ')).includes(term))
      ),
    })).filter(group => group.dams.length > 0);
  }, [groups, query, state]);
  const count = filtered.reduce((sum, group) => sum + group.dams.length, 0);
  const total = groups.reduce((sum, group) => sum + group.dams.length, 0);
  const reset = () => { setQuery(''); setState('all'); };
  return <section id="all-dams" aria-labelledby="all-dams-heading" className="scroll-mt-24">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="all-dams-heading" className="font-heading text-2xl font-bold tracking-tight text-primary-900">All dams</h2>
      <span role="status" aria-live="polite" className="text-sm text-neutral-600">{count} of {total} dams</span>
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
        {states.map(code => <option key={code} value={code}>{stateName(code)}</option>)}
      </select>
    </div>
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {filtered.map(group => <section key={group.label} aria-label={group.label} className="border-t border-neutral-200 first:border-t-0">
        <h3 className="bg-secondary-50 px-4 py-2.5 font-heading text-base font-bold text-primary-900">{group.label}</h3>
        <div className="hidden lg:block">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup><col className="w-[23%]" /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[17%]" /><col className="w-[28%]" /></colgroup>
            <thead><tr className="border-t border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-600">
              <th scope="col" className="px-4 py-2 font-semibold">Dam / lake</th>
              <th scope="col" className="px-3 py-2 font-semibold">Lake level</th>
              <th scope="col" className="px-3 py-2 font-semibold">Release</th>
              <th scope="col" className="px-3 py-2 font-semibold">Generation</th>
              <th scope="col" className="px-4 py-2 font-semibold">Next scheduled change</th>
            </tr></thead>
            <tbody>{group.dams.map(dam => <DesktopRow key={dam.id} dam={dam} now={now} />)}</tbody>
          </table>
        </div>
        <ul className="lg:hidden">{group.dams.map(dam => <MobileRow key={dam.id} dam={dam} now={now} />)}</ul>
      </section>)}
      {count === 0 && <div className="px-5 py-9 text-center">
        <p className="text-sm text-neutral-700">No matching dams.</p>
        <button type="button" className="mt-2 min-h-11 font-semibold text-primary-800 underline underline-offset-4" onClick={reset}>Clear search and filters</button>
      </div>}
    </div>
    <p className="mt-3 text-xs leading-5 text-neutral-600">Reading ages reflect the time measured. Generation status requires a recent turbine reading. Scheduled times are at the dam; water reaches downstream later.</p>
  </section>;
}
