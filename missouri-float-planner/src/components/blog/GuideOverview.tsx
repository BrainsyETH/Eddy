'use client';

import { useState } from 'react';
import type { GuideMapRoute } from '@/lib/guides/overview';

export default function GuideOverview({ routes, riverName }: { routes: GuideMapRoute[]; riverName: string }) {
  const [selected, setSelected] = useState(routes[0]?.id);
  if (!routes.length) return null;
  const active = routes.find(route => route.id === selected) ?? routes[0];
  return <section aria-label={`${riverName} featured route overview`} className="mb-6 overflow-hidden rounded-lg border-2 border-primary-700 bg-secondary-50 shadow-sm">
    <div className="flex items-center justify-between gap-3 px-4 pt-4">
      <h3 className="font-display text-xl text-primary-900">Where these floats sit</h3>
      <span className="text-xs text-neutral-600">North ↑</span>
    </div>
    <svg viewBox="0 0 600 300" className="block w-full" role="group" aria-label={`Selected route: ${active.label}. Orange shows this float; teal shows other featured stretches.`}>
      {routes.map(route => <path key={route.id} d={route.path} fill="none" stroke="var(--color-primary-600)" strokeWidth="3" strokeLinecap="round" />)}
      <path d={active.path} fill="none" stroke="var(--color-accent-500)" strokeWidth="6" strokeLinecap="round" />
      <circle cx={active.start[0]} cy={active.start[1]} r="7" fill="var(--color-primary-700)" stroke="white" strokeWidth="2" />
      <circle cx={active.end[0]} cy={active.end[1]} r="7" fill="var(--color-accent-600)" stroke="white" strokeWidth="2" />
      {routes.map(route => <path key={`target-${route.id}`} d={route.path} fill="none" stroke="transparent" strokeWidth="24" role="button" tabIndex={0}
        aria-label={`Show ${route.label}`} aria-pressed={active.id === route.id} className="cursor-pointer focus-visible:stroke-primary-400/30"
        onClick={() => setSelected(route.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(route.id); } }} />)}
    </svg>
    <p className="px-4 text-xs text-neutral-600">Featured stretches only. Open this float for the full map and access details.</p>
    <div className="mt-3 grid gap-1 border-t border-primary-200 bg-white p-2 sm:grid-cols-2">
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
