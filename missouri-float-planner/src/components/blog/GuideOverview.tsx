'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { GuideMapRoute } from '@/lib/guides/overview';

const GuideRouteMap = dynamic(() => import('./GuideRouteMap'), { ssr: false });

/** True once the map area has come near the viewport. Sticky, so the map never unmounts. */
function useNearViewport<T extends HTMLElement>(rootMargin = '400px') {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setNear(true); }, { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, rootMargin]);
  return { ref, near };
}

export default function GuideOverview({ routes, riverName, riverPath = null, riverSlug = null, geo = [], bounds = null, plannerUrls = {} }: {
  routes: GuideMapRoute[];
  riverName: string;
  riverPath?: string | null;
  /** With these three, the drawing is replaced by the shared interactive map once the reader scrolls near it. */
  riverSlug?: string | null;
  geo?: { id: number; coordinates: number[][] }[];
  bounds?: [number, number, number, number] | null;
  plannerUrls?: Record<string, string>;
}) {
  const [selected, setSelected] = useState(routes[0]?.id);
  const { ref, near } = useNearViewport<HTMLDivElement>();
  const select = useCallback((id: number) => setSelected(id), []);
  if (!routes.length) return null;
  const active = routes.find(route => route.id === selected) ?? routes[0];
  const plannerUrl = plannerUrls[String(active.id)];
  const interactive = Boolean(riverSlug && bounds && geo.length);
  return <section aria-label={`${riverName} featured route overview`} className="mb-6 overflow-hidden rounded-lg border-2 border-primary-700 bg-secondary-50 shadow-sm">
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <h3 className="font-display text-xl text-primary-900">Where these floats sit</h3>
      <span className="text-xs text-neutral-600">North ↑</span>
    </div>
    <div ref={ref} data-guide-map className="relative h-[400px] overflow-hidden md:h-[440px]">
      {/* The drawing is the placeholder, the no-JavaScript view and the fallback if the map engine fails. */}
      <svg viewBox="0 0 600 300" className="absolute inset-x-0 top-0 block h-[calc(100%-4rem)] w-full" role="group" aria-label={`Selected route: ${active.label}. Orange shows this float; teal shows other featured stretches; grey is the rest of the river.`}>
        {riverPath && <path data-guide-river d={riverPath} fill="none" stroke="var(--color-neutral-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {routes.map(route => <path key={route.id} d={route.path} fill="none" stroke="var(--color-primary-600)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
        <path d={active.path} fill="none" stroke="var(--color-accent-500)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={active.start[0]} cy={active.start[1]} r="7" fill="var(--color-primary-700)" stroke="white" strokeWidth="2" />
        <circle cx={active.end[0]} cy={active.end[1]} r="7" fill="var(--color-accent-600)" stroke="white" strokeWidth="2" />
        {routes.map(route => <path key={`target-${route.id}`} d={route.path} fill="none" stroke="transparent" strokeWidth="24" role="button" tabIndex={interactive && near ? -1 : 0}
          aria-label={`Show ${route.label}`} aria-pressed={active.id === route.id} className="cursor-pointer outline-none focus-visible:stroke-primary-400/30"
          onClick={() => setSelected(route.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(route.id); } }} />)}
      </svg>
      {interactive && near && <div className="absolute inset-0">
        <GuideRouteMap riverSlug={riverSlug!} routes={geo} bounds={bounds!} selectedId={active.id} onSelect={select} />
      </div>}
      {plannerUrl && <Link href={plannerUrl} data-ga-event="guide_planner_click" data-ga-label={`map: ${active.label}`}
        className="absolute bottom-3 left-14 z-10 inline-flex min-h-11 max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-lg border-2 border-primary-800 bg-accent-500 px-3 py-2 text-sm font-semibold text-white no-underline shadow-md hover:bg-accent-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-800">
        <span className="truncate">Plan {active.label}</span><span aria-hidden="true">→</span>
      </Link>}
    </div>
    <p className="px-4 pt-2 text-xs text-neutral-600">Featured floats in color: orange is the one selected. Tap a float on the map or in the list, then plan it.</p>
    <div className="mt-2 grid gap-1 border-t border-primary-200 bg-white p-2 sm:grid-cols-2">
      {routes.map(route => <button key={route.id} type="button" aria-pressed={active.id === route.id} onClick={() => setSelected(route.id)}
        className={`min-h-12 rounded-md px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${active.id === route.id ? 'bg-accent-50 text-accent-800' : 'text-primary-800 hover:bg-primary-50'}`}>
        <span className="font-semibold">{route.number}. {route.label}</span><span className="ml-2 whitespace-nowrap font-mono text-xs">{route.miles} mi</span>
      </button>)}
    </div>
    <div className="border-t border-primary-200 px-4 py-2" aria-live="polite">
      <a href={`#guide-float-${active.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-800 underline underline-offset-4">Read about {active.label} ↓</a>
    </div>
  </section>;
}
