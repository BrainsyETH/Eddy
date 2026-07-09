'use client';

import { useMemo } from 'react';
import { STAGE_VERDICTS, THEME, type MORiver, type StageVerdict } from '@/lib/usgs/mo-statewide-data';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import { computeDailyConditionSeries } from '../derive';
import { MONO } from './shared';

export function TimeScrubber({
  dayOffset,
  setDayOffset,
  history,
  rivers,
  expanded,
  onToggle,
}: {
  dayOffset: number;
  setDayOffset: (v: number) => void;
  history: MoHistoryBundleEntry[];
  rivers: MORiver[];
  /** Collapsed on mobile by default to reclaim map height; always true on md+. */
  expanded: boolean;
  onToggle: () => void;
}) {
  const RANGE = 30;

  // Per-river primary condition for each of the past 30 days, derived from
  // stage history. These gauges report stage (not always discharge), so a
  // percentile-based trend was empty for most of them — the timeline read as
  // broken. Instead: the trendline is the share of rivers that were
  // floatable per day, and the stripe is the full condition distribution.
  // Computation is shared with the scroll-story month chart (./derive) so
  // the two timelines can never disagree.
  const { trend, dailyBands, dayCount } = useMemo(() => {
    const s = computeDailyConditionSeries(history, rivers);
    // Anchor the axis to RANGE while history is still loading so the header
    // copy renders; the range input stays disabled until real days exist.
    return { trend: s.trend, dailyBands: s.dailyBands, dayCount: s.dayCount || RANGE };
  }, [history, rivers, RANGE]);
  const hasDays = trend.length > 0;

  const W = 1500, H = 64;
  const xAt = (i: number) => (i / Math.max(1, dayCount - 1)) * W;
  const yAt = (p: number) => H - 6 - (p / 100) * (H - 12);

  const linePath = trend.length
    ? trend.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xAt(pt.x).toFixed(1)} ${yAt(pt.y).toFixed(1)}`).join(' ')
    : '';
  const fillPath = trend.length
    ? linePath + ` L ${xAt(trend[trend.length - 1].x)} ${H} L 0 ${H} Z`
    : '';

  // dayOffset is negative (-30..0). Map to 0..dayCount-1.
  const indexFromOffset = (off: number) =>
    Math.round(((dayCount - 1) * (RANGE + off)) / RANGE);
  const offsetFromIndex = (idx: number) =>
    Math.round((idx / Math.max(1, dayCount - 1)) * RANGE) - RANGE;

  return (
    <div
      className="absolute inset-x-3 z-20 rounded-md border-2 px-4 pb-3 pt-2.5"
      style={{
        bottom: 12, height: expanded ? 130 : 44,
        background: THEME.primaryDark,
        // The scrubber is dark chrome over the dark map — it keeps its own
        // near-black border/shadow rather than the light Field-Notebook card
        // tokens (a warm offset shadow would read as a halo against the map).
        borderColor: '#3F3B33',
        color: THEME.parchment,
        boxShadow: '4px 4px 0 #1A1814',
        transition: 'height 220ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <span
            className="font-bold uppercase"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.15em', color: '#F2EAD8' }}
          >
            30-day timeline
          </span>
          {/* Hidden on phones: the wrapped hint pushed the chart past the
              card's fixed height. */}
          <span
            className="ml-3 hidden sm:inline"
            style={{
              fontFamily: MONO, fontSize: 10, color: 'rgba(242,234,216,0.6)',
            }}
          >
            {history.length
              ? 'drag to replay the past month · line = share of rivers floatable'
              : 'historical readings still loading…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: THEME.live,
            }}
          >
            {dayOffset === 0 ? 'TODAY' : `${Math.abs(dayOffset)}d ago`}
          </div>
          {/* Mobile-only collapse toggle — reclaims map height. Desktop keeps
              the timeline always open. */}
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse timeline' : 'Expand timeline'}
            aria-expanded={expanded}
            className="grid place-items-center md:hidden"
            style={{ width: 28, height: 28, color: THEME.parchment, fontSize: 13, lineHeight: 1 }}
          >
            {expanded ? '▾' : '▴'}
          </button>
        </div>
      </div>
      {expanded && (
        <>

      <div className="relative" style={{ height: 80 }}>
        <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full">
          <line x1="0" y1={yAt(50)} x2={W} y2={yAt(50)}
            stroke="rgba(242,234,216,0.18)" strokeDasharray="3 4" />
          <line x1="0" y1={yAt(75)} x2={W} y2={yAt(75)}
            stroke="rgba(242,234,216,0.10)" />
          <line x1="0" y1={yAt(25)} x2={W} y2={yAt(25)}
            stroke="rgba(242,234,216,0.10)" />

          {fillPath && <path d={fillPath} fill="rgba(74,154,173,0.20)" />}
          {linePath && <path d={linePath} stroke="#A3D1DB" strokeWidth="2.2" fill="none" />}

          {/* Color stripe along the bottom — distribution of river conditions
              per day, in the same vocabulary as the map and legend. */}
          {dailyBands.map((b) => {
            const order: StageVerdict[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'];
            const total = order.reduce((s, k) => s + b.counts[k], 0);
            if (!total) return null;
            const xc = xAt(b.x);
            const w = W / Math.max(1, dayCount) - 1;
            let acc = 0;
            const segs: Array<{ start: number; len: number; color: string }> = [];
            for (const k of order) {
              const ratio = b.counts[k] / total;
              if (ratio === 0) continue;
              segs.push({ start: acc, len: ratio * w, color: STAGE_VERDICTS[k].color });
              acc += ratio * w;
            }
            return (
              <g key={b.x} transform={`translate(${xc - w / 2} ${H + 1})`}>
                {segs.map((s, i) => (
                  <rect key={i} x={s.start} y={0} width={s.len} height={5} fill={s.color} opacity="0.9" />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Scrubber line */}
        {dayCount > 0 && (
          <div
            className="pointer-events-none absolute"
            style={{
              top: 0, bottom: 0,
              left: `${(indexFromOffset(dayOffset) / Math.max(1, dayCount - 1)) * 100}%`,
              width: 2, background: THEME.live,
              boxShadow: `0 0 10px ${THEME.live}`,
              transform: 'translateX(-50%)',
            }}
          >
            <div style={{
              position: 'absolute', top: -6, left: '50%',
              transform: 'translateX(-50%)',
              width: 12, height: 12, background: THEME.live,
              borderRadius: 99, border: '2px solid #3F3B33',
            }} />
          </div>
        )}
        <input
          type="range" min={0} max={Math.max(0, dayCount - 1)} step={1}
          value={indexFromOffset(dayOffset)}
          aria-label="Scrub days"
          disabled={!hasDays}
          onChange={(e) => setDayOffset(offsetFromIndex(parseInt(e.target.value, 10)))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: hasDays ? 'ew-resize' : 'default', margin: 0,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between"
        style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(242,234,216,0.5)' }}>
        <span>30d</span><span>22d</span><span>15d</span><span>7d</span><span>today</span>
      </div>
        </>
      )}
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────
//
// Centered popup with feature details + outbound links. Used for access
// points, campgrounds, and POIs. The right rail keeps showing the river
// the feature belongs to so the modal doesn't lose the river context.

