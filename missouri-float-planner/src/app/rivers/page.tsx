// src/app/rivers/page.tsx
// River Reports — the canonical, status-first river index. Server-rendered hero
// (with Eddy's cross-river summary) wrapping the live conditions dashboard.

import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import SiteFooter from '@/components/ui/SiteFooter';
import RiverReportsGrid from '@/components/gauge/RiverReportsGrid';
import { EDDY_IMAGES } from '@/constants';
import { buildRiversSummary } from '@/data/eddy-quotes';
import { getRivers } from '@/lib/data/rivers';

export const revalidate = 300; // ISR every 5 minutes

export const metadata: Metadata = {
  title: 'River Reports',
  description: 'Live USGS conditions for every Ozark float river — water levels, flow trends, and Eddy\'s float report. Check real-time levels before your next float.',
};

export default async function RiversPage() {
  const rivers = await getRivers();

  // Build Eddy's summary across all rivers (server-side, from current conditions)
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
                River Reports
              </h1>
              <p className="text-sm md:text-base text-white/70 max-w-md">
                {eddySummary}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live conditions dashboard (filter + search + per-river cards) */}
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-neutral-200 animate-pulse" />}>
          <RiverReportsGrid />
        </Suspense>

        {/* Data attribution */}
        <div className="mt-8 bg-primary-50 border border-primary-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-neutral-900 mb-2">About This Data</h3>
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
