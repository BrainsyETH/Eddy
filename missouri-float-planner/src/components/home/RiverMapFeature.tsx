// src/components/home/RiverMapFeature.tsx
// Homepage link to /river-map, alongside Find a float and Plan a float.
//
// Drawn in the site's own card language: the standard card's 2px teal border,
// hard offset shadow and hover lift, over the Missouri hillshade the real map
// uses. The rivers are flat strokes in the condition colours with a dark
// casing, like a printed trail map, rather than glowing lines on a dark field.
//
// Presentational only — no data hooks — so it renders instantly server-side
// with no loading state or layout shift. The live data lives on /river-map
// itself.

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CONDITION_SYSTEM } from '@shared/condition-system';

// The real map paints each river by its live verdict, so the teaser uses the
// same canonical colours rather than decorative ones.
const FLOWING = CONDITION_SYSTEM.flowing.solid;
const GOOD = CONDITION_SYSTEM.good.solid;
const HIGH = CONDITION_SYSTEM.high.solid;
const LOW = CONDITION_SYSTEM.low.solid;
const INK = '#2D2A24'; // neutral-900, the casing and dot ring

const RIVERS = [
  { d: 'M 150 -20 C 190 40, 120 90, 200 140 C 260 178, 230 240, 250 320', color: FLOWING },
  { d: 'M 250 -20 C 285 50, 235 100, 300 150 C 350 188, 335 250, 360 320', color: GOOD },
  { d: 'M 330 -20 C 355 40, 320 80, 360 130', color: HIGH },
  { d: 'M 40 90 C 100 120, 150 110, 200 140', color: LOW },
];

const GAUGES = [
  { cx: 200, cy: 140, color: FLOWING },
  { cx: 172, cy: 62, color: FLOWING },
  { cx: 300, cy: 150, color: GOOD },
  { cx: 346, cy: 250, color: GOOD },
  { cx: 352, cy: 120, color: HIGH },
];

export default function RiverMapFeature() {
  return (
    <Link
      href="/river-map"
      data-ga-event="cta_river_map"
      data-ga-label="home_feature"
      aria-label="Open the live river map"
      // .card is unlayered CSS, so its 1.25rem padding outranks a p-0 utility.
      className="card group min-h-[240px] overflow-hidden no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
      style={{ padding: 0 }}
    >
      {/* ── Map art: hillshade texture on sandbar tan, flat cased rivers ── */}
      <div aria-hidden="true" className="relative min-h-[150px] flex-1 overflow-hidden bg-secondary-100">
        <Image
          src="/mo-hillshade.avif"
          alt=""
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover opacity-30 mix-blend-multiply"
        />
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {RIVERS.map((river) => (
              <path key={`casing-${river.d}`} d={river.d} stroke={INK} strokeWidth={6.5} />
            ))}
            {RIVERS.map((river) => (
              <path key={river.d} d={river.d} stroke={river.color} strokeWidth={4} />
            ))}
          </g>
          {GAUGES.map((gauge) => (
            <circle key={`${gauge.cx}-${gauge.cy}`} cx={gauge.cx} cy={gauge.cy} r={6} fill={gauge.color} stroke={INK} strokeWidth={2.5} />
          ))}
        </svg>
      </div>

      {/* ── Caption bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-primary-700 bg-white px-5 py-4">
        <h3 className="text-xl md:text-2xl font-bold leading-tight text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
          Live river map
        </h3>
        {/* A button's look on a span: the whole card is the link, and a link
            cannot hold another one. */}
        <span className="btn-primary btn--sm inline-flex items-center gap-1.5">
          Open the map
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
