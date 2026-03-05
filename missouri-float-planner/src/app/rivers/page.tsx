'use client';

// src/app/rivers/page.tsx
// Rivers index page - browse all supported rivers

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, ArrowRight } from 'lucide-react';
import { useRivers } from '@/hooks/useRivers';
import SiteFooter from '@/components/ui/SiteFooter';
import { CONDITION_COLORS, CONDITION_LABELS, EDDY_IMAGES, getEddyImageForCondition } from '@/constants';
import { buildRiversSummary, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';

// Brief descriptions for each river
const RIVER_DESCRIPTIONS: Record<string, string> = {
  'meramec': 'One of Missouri\'s longest free-flowing rivers, winding through scenic bluffs and popular with paddlers of all levels.',
  'current': 'A National Scenic Riverway fed by massive springs, known for crystal-clear water and excellent floating year-round.',
  'eleven-point': 'A designated National Scenic River offering remote floating through the Mark Twain National Forest.',
  'jacks-fork': 'A spring-fed tributary of the Current River within the Ozark National Scenic Riverways, great for shorter float trips.',
  'niangua': 'A scenic Ozark stream flowing through Camden and Dallas counties, popular for leisurely summer floats.',
  'big-piney': 'A beautiful Ozark river with Class I-II rapids, bluffs, and a remote feel — excellent for intermediate paddlers.',
  'huzzah': 'A smaller, spring-fed stream in the Meramec basin known for quick floats and family-friendly conditions.',
  'courtois': 'A tributary of the Huzzah, offering intimate floating through wooded Ozark hills with relatively consistent water levels.',
};

// Condition summary pill config
const CONDITION_PILL_CONFIG: { code: ConditionCode; label: string; bgClass: string }[] = [
  { code: 'optimal', label: 'Optimal', bgClass: 'bg-emerald-600' },
  { code: 'okay', label: 'Okay', bgClass: 'bg-lime-500' },
  { code: 'low', label: 'Low', bgClass: 'bg-yellow-500' },
  { code: 'too_low', label: 'Too Low', bgClass: 'bg-neutral-400' },
  { code: 'high', label: 'High', bgClass: 'bg-orange-500' },
  { code: 'dangerous', label: 'Flood', bgClass: 'bg-red-600' },
];

export default function RiversPage() {
  const { data: rivers, isLoading } = useRivers();

  // Build Eddy's summary across all rivers
  const conditionCodes = rivers?.map(r => r.currentCondition?.code ?? null) ?? [];
  const eddySummary = rivers ? buildRiversSummary(conditionCodes) : null;

  // Count rivers per condition for summary pills
  const conditionCounts: Partial<Record<ConditionCode, number>> = {};
  if (rivers) {
    for (const river of rivers) {
      const code = river.currentCondition?.code ?? 'unknown';
      conditionCounts[code] = (conditionCounts[code] || 0) + 1;
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section
        className="relative py-12 md:py-20 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="-mb-1">
            <Image
              src={EDDY_IMAGES.canoe}
              alt="Eddy the Otter in a canoe"
              width={400}
              height={400}
              className="mx-auto h-32 md:h-40 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Missouri Float Rivers
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Explore our supported rivers with live conditions, access points, and float planning tools.
          </p>

          {/* Condition summary pills */}
          {rivers && rivers.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              {CONDITION_PILL_CONFIG.map(({ code, label, bgClass }) => {
                const count = conditionCounts[code];
                if (!count) return null;
                return (
                  <span
                    key={code}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold ${bgClass}`}
                  >
                    <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                      {count}
                    </span>
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Eddy summary quote */}
          {eddySummary && (
            <div className="mt-4 inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 max-w-xl mx-auto">
              <Image
                src={EDDY_IMAGES.canoe}
                alt="Eddy"
                width={40}
                height={40}
                className="w-8 h-8 object-contain flex-shrink-0"
              />
              <p className="text-sm text-white/90 text-left">
                &ldquo;{eddySummary}&rdquo;
              </p>
            </div>
          )}
        </div>
      </section>

      {/* River Cards */}
      <section className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden">
                <div className="skeleton h-44 w-full" />
                <div className="p-4 space-y-3">
                  <div className="skeleton h-6 w-40 rounded" />
                  <div className="skeleton h-4 w-full rounded" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="flex gap-4">
                    <div className="skeleton h-4 w-20 rounded" />
                    <div className="skeleton h-4 w-28 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {rivers?.map((river) => {
              const conditionCode = river.currentCondition?.code;
              const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
              const conditionLabel = conditionCode ? CONDITION_LABELS[conditionCode] : 'Unknown';
              const description = RIVER_DESCRIPTIONS[river.slug] || river.description;
              const blurb = conditionCode ? CONDITION_CARD_BLURBS[conditionCode] : CONDITION_CARD_BLURBS.unknown;

              return (
                <Link
                  key={river.id}
                  href={`/rivers/${river.slug}`}
                  className="group bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-primary-300 transition-all no-underline"
                >
                  {/* Image */}
                  <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary-800 to-primary-900">
                    <div className="w-full h-full flex items-center justify-center">
                      <Image
                        src={getEddyImageForCondition(conditionCode || 'unknown')}
                        alt="Eddy the Otter"
                        width={160}
                        height={160}
                        className="w-24 h-24 object-contain drop-shadow-lg transition-transform duration-500"
                      />
                    </div>
                    {/* Condition badge + blurb overlay */}
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-lg"
                        style={{ backgroundColor: conditionColor }}
                      >
                        {conditionLabel}
                      </div>
                      <div className="bg-black/40 backdrop-blur-sm text-white/90 text-[11px] px-2 py-0.5 rounded-full">
                        {blurb}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h2 className="text-xl font-bold text-neutral-900 group-hover:text-primary-600 transition-colors">
                        {river.name}
                      </h2>
                      <ArrowRight className="w-5 h-5 text-neutral-500 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                    </div>

                    {description && (
                      <p className="text-sm text-neutral-600 leading-relaxed mb-3 line-clamp-2">
                        {description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5" />
                        {river.lengthMiles} miles
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {river.accessPointCount} access points
                      </span>
                      {river.region && (
                        <span className="text-neutral-500">{river.region}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <SiteFooter className="mt-8" />
    </div>
  );
}
