// src/components/home/RiverMapFeature.tsx
// Landing-page feature band for /river-map — a self-contained visual teaser
// (brand gradient + a stylized river/topo SVG) that sells the live statewide
// map. Pairs with FloatingWellNow in the home "conditions at a glance" 2-col
// band, replacing the old EddySaysReport card (Eddy's live voice already lives
// in the hero bubble, so a second statewide quote read as redundant).
//
// Presentational only — no data hooks — so it renders instantly server-side
// with no loading state or layout shift. The live data lives on /river-map
// itself and in the FloatingWellNow list beside it.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Condition palette mirrored from shared/condition-system. The real map paints
// each river by its live USGS verdict, so the teaser's rivers use those exact
// colors rather than inventing decorative ones.
const FLOWING = '#10b981'; // emerald-500
const GOOD = '#84cc16'; // lime-500
const HIGH = '#f97316'; // orange-500
const LOW = '#eab308'; // yellow-500

// A stylized river gauge dot: soft colored halo + white core.
function GaugeDot({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.25} />
      <circle cx={cx} cy={cy} r={3.2} fill="#ffffff" />
    </g>
  );
}

export default function RiverMapFeature() {
  return (
    <Link
      href="/river-map"
      data-ga-event="cta_river_map"
      data-ga-label="home_feature"
      aria-label="Open the live River Map"
      className="group relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-2xl p-5 md:p-6 no-underline shadow-soft-md"
      style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 45%, #1A4F5C 100%)' }}
    >
      {/* ── Decorative map layer: topo contours + rivers colored by condition ── */}
      <svg
        aria-hidden="true"
        className="absolute inset-y-0 right-0 h-full w-[72%] transition-transform duration-500 group-hover:scale-105"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Faint topographic contours */}
        <g fill="none" stroke="#ffffff" strokeOpacity={0.07}>
          <path d="M -20 70 C 80 40, 200 90, 420 50" />
          <path d="M -20 130 C 90 100, 210 150, 420 110" />
          <path d="M -20 200 C 100 170, 220 220, 420 180" />
          <path d="M -20 265 C 110 235, 230 285, 420 245" />
        </g>

        {/* River glow underlays (wide, low-opacity) for a lit-from-within feel */}
        <g fill="none" strokeLinecap="round" strokeWidth={7} opacity={0.22}>
          <path d="M 150 -20 C 190 40, 120 90, 200 140 C 260 178, 230 240, 250 320" stroke={FLOWING} />
          <path d="M 250 -20 C 285 50, 235 100, 300 150 C 350 188, 335 250, 360 320" stroke={GOOD} />
          <path d="M 330 -20 C 355 40, 320 80, 360 130" stroke={HIGH} />
          <path d="M 60 90 C 110 120, 150 110, 200 140" stroke={LOW} />
        </g>

        {/* Crisp river lines */}
        <g fill="none" strokeLinecap="round" strokeWidth={2.6}>
          <path d="M 150 -20 C 190 40, 120 90, 200 140 C 260 178, 230 240, 250 320" stroke={FLOWING} />
          <path d="M 250 -20 C 285 50, 235 100, 300 150 C 350 188, 335 250, 360 320" stroke={GOOD} />
          <path d="M 330 -20 C 355 40, 320 80, 360 130" stroke={HIGH} />
          <path d="M 60 90 C 110 120, 150 110, 200 140" stroke={LOW} />
        </g>

        {/* Gauge stations */}
        <GaugeDot cx={200} cy={140} color={FLOWING} />
        <GaugeDot cx={172} cy={62} color={FLOWING} />
        <GaugeDot cx={300} cy={150} color={GOOD} />
        <GaugeDot cx={346} cy={250} color={GOOD} />
        <GaugeDot cx={352} cy={120} color={HIGH} />
      </svg>

      {/* Left scrim so the copy stays legible over the map art */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, #0F2D35 0%, rgba(15,45,53,0.72) 42%, rgba(15,45,53,0) 78%)' }}
      />

      {/* ── Foreground ── */}
      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: FLOWING }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: FLOWING }} />
          </span>
          Live · statewide
        </span>
      </div>

      <div className="relative z-10 mt-4">
        <h2 className="max-w-[15rem] text-xl md:text-2xl font-bold leading-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>
          See every Missouri river, live
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
          One map — every curated river painted by its USGS gauges, with 30-day
          trends, flood warnings, and a drag-to-replay timeline.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          Open the River Map
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
