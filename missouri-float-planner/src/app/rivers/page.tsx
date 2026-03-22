// src/app/rivers/page.tsx
// Rivers index page - browse all supported rivers (server-rendered)

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, ArrowRight } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import { CONDITION_COLORS, CONDITION_LABELS, EDDY_IMAGES } from '@/constants';
import { buildRiversSummary } from '@/data/eddy-quotes';
import { getRivers } from '@/lib/data/rivers';

export const revalidate = 300; // ISR every 5 minutes

export const metadata: Metadata = {
  title: 'Float Rivers',
  description: 'Browse all supported rivers with live conditions, access points, and float planning tools. Check real-time water levels before your next float trip.',
};

// Brief descriptions for each river
const RIVER_DESCRIPTIONS: Record<string, string> = {
  'meramec': 'One of the longest free-flowing rivers in the region, winding through scenic bluffs and popular with paddlers of all levels.',
  'current': 'A National Scenic Riverway fed by massive springs, known for crystal-clear water and excellent floating year-round.',
  'eleven-point': 'A designated National Scenic River offering remote floating through the Mark Twain National Forest.',
  'jacks-fork': 'A spring-fed tributary of the Current River within the National Scenic Riverways, great for shorter float trips.',
  'niangua': 'A scenic stream known for leisurely summer floats and beautiful surroundings.',
  'big-piney': 'A beautiful river with Class I-II rapids, bluffs, and a remote feel — excellent for intermediate paddlers.',
  'huzzah': 'A smaller, spring-fed stream in the Meramec basin known for quick floats and family-friendly conditions.',
  'courtois': 'A tributary of the Huzzah, offering intimate floating through wooded hills with relatively consistent water levels.',
};

export default async function RiversPage() {
  const rivers = await getRivers();

  // Build Eddy's summary across all rivers
  const conditionCodes = rivers.map(r => r.currentCondition?.code ?? null);
  const eddySummary = buildRiversSummary(conditionCodes);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      {/* Hero */}
      <section
        className="relative py-8 md:py-10 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute bottom-0 left-0 right-0 h-24"
               style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 80px)' }} />
        </div>

        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-6 md:gap-8">
            <Image
              src={EDDY_IMAGES.canoe}
              alt="Eddy the Otter"
              width={300}
              height={300}
              className="h-20 md:h-28 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
            <div>
              <h1
                className="text-2xl md:text-4xl font-bold mb-1"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                Float Rivers
              </h1>
              <p className="text-sm md:text-base text-white/70 max-w-md">
                {eddySummary}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* River Cards */}
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rivers.map((river) => {
            const conditionCode = river.currentCondition?.code;
            const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
            const conditionLabel = conditionCode ? CONDITION_LABELS[conditionCode] : 'Unknown';
            const description = RIVER_DESCRIPTIONS[river.slug] || river.description;

            return (
              <Link
                key={river.id}
                href={`/rivers/${river.slug}`}
                className="group bg-white border border-neutral-200 rounded-xl overflow-hidden transition-all hover:shadow-md hover:border-primary-300 no-underline"
              >
                <div className="px-4 pt-4 pb-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <Droplets className="w-4 h-4 text-primary-500 flex-shrink-0" />
                        <h2 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                          {river.name}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white"
                          style={{ backgroundColor: conditionColor }}
                        >
                          {conditionLabel}
                        </span>
                        {river.region && (
                          <span className="text-xs text-neutral-500">{river.region}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </div>
                </div>

                {description && (
                  <div className="px-4 pb-3 sm:px-5">
                    <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">
                      {description}
                    </p>
                  </div>
                )}

                <div className="px-4 pb-4 sm:px-5">
                  <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2.5 border-t border-neutral-100">
                    <span className="flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5" />
                      {river.lengthMiles} miles
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {river.accessPointCount} access points
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Info box */}
        <div className="mt-8 bg-primary-50 border border-primary-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-neutral-900 mb-2">About These Rivers</h3>
          <p className="text-sm text-neutral-700">
            All condition data is provided by the <strong>United States Geological Survey (USGS)</strong> through
            their Water Services API. Readings are updated hourly and typically lag real-time conditions by
            15-60 minutes.
          </p>
        </div>
      </div>

      <SiteFooter maxWidth="max-w-5xl" className="mt-12" />
    </div>
  );
}
