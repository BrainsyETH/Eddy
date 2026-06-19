'use client';

// src/components/home/EddyHeroBubble.tsx
// Live, rotating "Eddy says" speech bubble for the hero. Cycles through rivers
// (floatable first) showing each river's level + status + Eddy's quote, with a
// "Live" chip, progress dots, pause-on-hover, and reduced-motion support.
// Data: useRiverGroups (level/condition) + useEddyUpdates (one batched quote call).

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { CONDITION_COLORS } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverGroup } from '@/lib/river-groups';

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
  const { data: eddyUpdates } = useEddyUpdates();
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
  const [interacted, setInteracted] = useState(false);

  // Keep index in range when the slide set changes.
  useEffect(() => {
    setIndex((i) => (slides.length ? i % slides.length : 0));
  }, [slides.length]);

  // Auto-rotate (paused on hover / when reduced motion is requested).
  useEffect(() => {
    if (paused || interacted || reduceMotion || slides.length <= 1) return;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setFading(true);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % slides.length);
        setFading(false);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => { clearInterval(interval); clearTimeout(fadeTimer); };
  }, [paused, interacted, reduceMotion, slides.length]);

  if (isLoading || slides.length === 0) return <BubbleShell skeleton />;

  const river = slides[index];
  const color = CONDITION_COLORS[river.condition.code] || CONDITION_COLORS.unknown;
  const level = levelLabel(river);
  const update = river.riverSlug ? eddyUpdates?.[river.riverSlug] : undefined;
  // Prefer the short summary so the bubble shows a complete quote rather than a
  // truncated full one; fall back to the full quote, then a static blurb.
  const quote =
    update?.summaryText ||
    update?.quoteText ||
    CONDITION_CARD_BLURBS[river.condition.code] ||
    CONDITION_CARD_BLURBS.unknown;
  const href = river.riverSlug ? `/rivers/${river.riverSlug}` : '#';

  const goTo = (i: number) => {
    setInteracted(true); // manual navigation stops the auto-rotation
    if (i === index) return;
    setFading(true);
    setTimeout(() => { setIndex(i); setFading(false); }, FADE_MS / 2);
  };

  return (
    <BubbleShell onPause={setPaused}>
      {/* Header: identity */}
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-2">
          <Image
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png"
            alt="Eddy"
            width={24}
            height={24}
            className="w-6 h-6 rounded-full flex-shrink-0"
          />
          <span className="text-sm font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            Eddy says
          </span>
        </div>
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
        <Link
          href={href}
          data-ga-event="bubble_river"
          data-ga-label={river.riverSlug ?? river.riverName}
          className="inline-flex items-center gap-1 text-xs font-bold text-accent-600 hover:text-accent-700 transition-colors no-underline"
        >
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
      className="relative bg-white rounded-2xl p-5 text-left shadow-[0_18px_44px_rgba(8,24,21,0.30)] min-h-[210px]"
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
      {/* Tail pointing down toward the otter: centered on mobile; on desktop the
          tip sits over Eddy's center. Eddy is flush-right at w-52 (md) / w-60 (lg),
          so its center is 104px / 120px from the column edge; the bubble is inset
          right-12 (48px) and the tail is 20px wide, giving right = center-58px. */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-[46px] lg:right-[62px] w-5 h-5 bg-white rotate-45 shadow-[6px_6px_14px_rgba(8,24,21,0.10)]" />
    </div>
  );
}
