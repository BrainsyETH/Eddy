'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { RiverListItem } from '@/types/api';
import type { DamSnapshot, DamsResponse } from '@shared/dam-types';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import { buildConditionsDestinations } from '@/lib/conditions/directory';
import RiverCard from '@/components/gauge/RiverCard';
import DamListCard from '@/components/dam/DamListCard';
import RiverReportFallback from '@/components/conditions/RiverReportFallback';

type ReportKind = 'rivers' | 'dams';
const KINDS: ReportKind[] = ['rivers', 'dams'];

/** The Conditions page's existing cards, one river and one dam at a time. */
export default function HomeRiverReports({ rivers, dams: initialDams, renderedAt, damsUnavailable = false }: {
  rivers: RiverListItem[]; dams: DamSnapshot[]; renderedAt: number; damsUnavailable?: boolean;
}) {
  const { riverGroups, isLoading } = useRiverGroups();
  const [now, setNow] = useState(renderedAt);
  const [positions, setPositions] = useState({ rivers: 0, dams: 0 });
  const current = useRef(positions);
  const section = useRef<HTMLDivElement>(null);
  const tracks = useRef<Record<ReportKind, HTMLDivElement | null>>({ rivers: null, dams: null });
  const interacted = useRef(false);
  const damQuery = useQuery<DamSnapshot[]>({
    queryKey: ['conditions-dams'],
    queryFn: async () => {
      const response = await fetch('/api/dams');
      if (!response.ok) throw new Error('Dam readings unavailable');
      const data = await response.json() as DamsResponse;
      if (!Array.isArray(data.dams) || data.dams.length === 0) throw new Error('Dam readings unavailable');
      return data.dams;
    },
    initialData: initialDams, initialDataUpdatedAt: damsUnavailable ? 0 : renderedAt,
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true, retry: 1,
  });
  const dams = useMemo(() => {
    const readings = new Map(damQuery.data.map(dam => [dam.id, dam]));
    return initialDams.map(dam => readings.get(dam.id) ?? dam);
  }, [initialDams, damQuery.data]);
  const destinations = useMemo(() => buildConditionsDestinations(rivers, dams, riverGroups), [rivers, dams, riverGroups]);
  const reports = {
    rivers: destinations.filter(destination => destination.kind === 'rivers'),
    dams: destinations.filter(destination => destination.kind === 'dams'),
  };

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let hovering = false;
    let timer: ReturnType<typeof setTimeout>;
    const lengths = { rivers: rivers.length, dams: initialDams.length };
    const advance = () => {
      if (visible && !hovering && !interacted.current && !motion.matches && !document.hidden) {
        for (const kind of KINDS) {
          const track = tracks.current[kind];
          if (!track || lengths[kind] < 2) continue;
          const index = (current.current[kind] + 1) % lengths[kind];
          track.scrollTo({ left: index * track.clientWidth, behavior: index === 0 ? 'instant' : 'smooth' });
        }
      }
      timer = setTimeout(advance, 8000);
    };
    const restart = () => { clearTimeout(timer); timer = setTimeout(advance, 8000); };
    const enter = (event: PointerEvent) => { if (event.pointerType === 'mouse') hovering = true; };
    const leave = () => { hovering = false; restart(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; restart(); }, { threshold: 0.35 });
    observer.observe(element);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', restart);
    // Keep the selected reports aligned when columns become stacked on mobile.
    const resize = new ResizeObserver(() => {
      for (const kind of KINDS) {
        const track = tracks.current[kind];
        if (track) track.scrollTo({ left: current.current[kind] * track.clientWidth, behavior: 'instant' });
      }
    });
    for (const track of Object.values(tracks.current)) if (track) resize.observe(track);
    restart();
    return () => {
      clearTimeout(timer); observer.disconnect(); resize.disconnect();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [rivers.length, initialDams.length]);

  function browse(kind: ReportKind, step: number) {
    interacted.current = true;
    const track = tracks.current[kind];
    if (!track || reports[kind].length < 2) return;
    const index = (current.current[kind] + step + reports[kind].length) % reports[kind].length;
    track.scrollTo({ left: index * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  return <div ref={section} className="grid items-start gap-5 md:grid-cols-2"
    onFocusCapture={() => { interacted.current = true; }}
    onPointerDownCapture={() => { interacted.current = true; }}>
    {KINDS.map(kind => <section key={kind} aria-label={kind === 'rivers' ? 'River reports' : 'Dam reports'} aria-roledescription="carousel" className="min-w-0">
      <div ref={element => { tracks.current[kind] = element; }}
        className="relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={event => {
          const track = event.currentTarget;
          if (!track.clientWidth) return;
          const index = Math.max(0, Math.min(reports[kind].length - 1, Math.round(track.scrollLeft / track.clientWidth)));
          if (index !== current.current[kind]) {
            current.current = { ...current.current, [kind]: index };
            setPositions(current.current);
          }
        }}>
        {reports[kind].map((destination, index) => <div key={destination.key} role="group" aria-roledescription="slide"
          aria-label={`${index + 1} of ${reports[kind].length}: ${destination.name}`} inert={index !== positions[kind]}
          data-home-report={destination.key} className="w-full min-w-0 shrink-0 snap-start snap-always">
          {destination.kind === 'dams'
            ? <DamListCard dam={destination.dam} now={now} href={destination.href} />
            : destination.group
              ? <RiverCard riverGroup={destination.group} meta={destination.meta} href={destination.href} />
              : <RiverReportFallback river={destination.river} loading={isLoading} />}
        </div>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Link href={kind === 'rivers' ? '/rivers?kind=rivers' : '/dams'} className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-primary-700 no-underline focus-visible:outline-2 focus-visible:outline-primary-600">
          {kind === 'rivers' ? 'All Rivers' : 'All Dams'}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        {reports[kind].length > 1 && <div className="flex gap-1">
          <button type="button" onClick={() => browse(kind, -1)} aria-label={`Previous ${kind === 'rivers' ? 'river' : 'dam'} report`} className="flex size-11 items-center justify-center rounded-lg text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600"><ArrowLeft className="size-5" aria-hidden="true" /></button>
          <button type="button" onClick={() => browse(kind, 1)} aria-label={`Next ${kind === 'rivers' ? 'river' : 'dam'} report`} className="flex size-11 items-center justify-center rounded-lg text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600"><ArrowRight className="size-5" aria-hidden="true" /></button>
        </div>}
      </div>
    </section>)}
  </div>;
}
