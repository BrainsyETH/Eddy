'use client';

// src/components/home/EddyHeroBubble.tsx
// Live, rotating "Eddy says" speech bubble for the hero. Cycles through rivers
// (floatable first) showing each river's level + status + Eddy's quote, with a
// "Live" chip, progress dots, pause-on-hover, and reduced-motion support.
// Data: useRiverGroups (level/condition) + /api/eddy-update/{slug} (quote).

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverGroup } from '@/lib/river-groups';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

// Show the best-looking rivers first, capped to keep the rotation tight.
const RANK: Record<string, number> = {
  flowing: 0, good: 1, high: 2, low: 3, too_low: 4, dangerous: 5, unknown: 6,
};
const MAX_SLIDES = 5;
const ROTATE_MS = 4500;
const FADE_MS = 320;

function levelLabel(r: RiverGroup): string | null {
  const isCfs = r.primaryThreshold?.thresholdUnit === 'cfs';
  const value = isCfs ? r.primaryGauge.dischargeCfs : r.primaryGauge.gaugeHeightFt;
  if (value == null) return null;
  return isCfs ? `${Math.round(value).toLocaleString()} cfs` : `${value.toFixed(1)} ft`;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduce;
}

export default function EddyHeroBubble() {
  const { riverGroups, isLoading } = useRiverGroups();
  const reduceMotion = usePrefersReducedMotion();

  const slides = useMemo(
    () =>
      [...riverGroups]
        .sort((a, b) => (RANK[a.condition.code] ?? 9) - (RANK[b.condition.code] ?? 9))
        .slice(0, MAX_SLIDES),
    [riverGroups],
  );

  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // Keep index in range when the slide set changes.
  useEffect(() => {
    setIndex((i) => (slides.length ? i % slides.length : 0));
  }, [slides.length]);

  // Fetch each river's Eddy quote once.
  useEffect(() => {
    let cancelled = false;
    slides.forEach((r) => {
      const slug = r.riverSlug;
      if (!slug || fetchedRef.current.has(slug)) return;
      fetchedRef.current.add(slug);
      fetch(`/api/eddy-update/${slug}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: EddyUpdateResponse | null) => {
          if (cancelled || !data?.available || !data.update) return;
          const text = data.update.summaryText || data.update.quoteText;
          if (text) setQuotes((q) => ({ ...q, [slug]: text }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [slides]);

  // Auto-rotate (paused on hover / when reduced motion is requested).
  useEffect(() => {
    if (paused || reduceMotion || slides.length <= 1) return;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setFading(true);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % slides.length);
        setFading(false);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => { clearInterval(interval); clearTimeout(fadeTimer); };
  }, [paused, reduceMotion, slides.length]);

  if (isLoading || slides.length === 0) return <BubbleShell skeleton />;

  const river = slides[index];
  const color = CONDITION_COLORS[river.condition.code] || CONDITION_COLORS.unknown;
  const level = levelLabel(river);
  const quote =
    (river.riverSlug && quotes[river.riverSlug]) ||
    CONDITION_CARD_BLURBS[river.condition.code] ||
    CONDITION_CARD_BLURBS.unknown;
  const href = river.riverSlug ? `/rivers/${river.riverSlug}` : '#';

  const goTo = (i: number) => {
    if (i === index) return;
    setFading(true);
    setTimeout(() => { setIndex(i); setFading(false); }, FADE_MS / 2);
  };

  return (
    <BubbleShell onPause={setPaused}>
      {/* Header: identity + live */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-support-500 border-2 border-support-200 flex-shrink-0" />
          <span className="text-sm font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            Eddy says
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-support-600">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-support-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-support-500" />
          </span>
          Live
        </span>
      </div>

      {/* Rotating river content */}
      <div
        style={{
          transition: 'opacity .3s ease, transform .3s ease',
          opacity: fading ? 0 : 1,
          transform: fading ? 'translateY(6px)' : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {river.riverName}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 flex-shrink-0">
            {level && (
              <span className="text-base font-bold text-neutral-900 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                {level}
              </span>
            )}
            <span className="text-xs font-semibold" style={{ color }}>{river.condition.label}</span>
          </div>
        </div>
        <p className="text-sm text-neutral-600 leading-relaxed line-clamp-3">&ldquo;{quote}&rdquo;</p>
      </div>

      {/* Footer: progress dots + per-river CTA */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
        <div className="flex gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.riverId}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show ${s.riverName}`}
              className="p-1 -m-1"
            >
              <span className={`block w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-accent-500' : 'bg-neutral-300'}`} />
            </button>
          ))}
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-accent-600 hover:text-accent-700 transition-colors no-underline">
          See {river.riverName} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </BubbleShell>
  );
}

// Shared white bubble shell with a downward tail (desktop) toward the otter.
function BubbleShell({
  children,
  skeleton = false,
  onPause,
}: {
  children?: ReactNode;
  skeleton?: boolean;
  onPause?: (paused: boolean) => void;
}) {
  return (
    <div
      className="relative bg-white rounded-2xl p-5 text-left shadow-[0_18px_44px_rgba(8,24,21,0.30)]"
      onMouseEnter={onPause ? () => onPause(true) : undefined}
      onMouseLeave={onPause ? () => onPause(false) : undefined}
    >
      {skeleton ? (
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-neutral-200" />
              <span className="h-4 w-20 bg-neutral-200 rounded" />
            </div>
            <span className="h-3 w-10 bg-neutral-100 rounded" />
          </div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="h-5 w-32 bg-neutral-200 rounded" />
            <span className="h-5 w-16 bg-neutral-100 rounded" />
          </div>
          <span className="block h-3.5 w-full bg-neutral-100 rounded mb-1.5" />
          <span className="block h-3.5 w-3/4 bg-neutral-100 rounded" />
        </div>
      ) : (
        children
      )}
      {/* Tail pointing down toward the otter (desktop only) */}
      <div className="hidden md:block absolute -bottom-2 right-10 w-5 h-5 bg-white rotate-45 shadow-[6px_6px_14px_rgba(8,24,21,0.10)]" />
    </div>
  );
}
