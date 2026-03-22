// src/app/page.tsx
// Landing page for Eddy (server-rendered with client islands)

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getRivers } from '@/lib/data/rivers';
import { CONDITION_COLORS } from '@/constants';
import FloatEstimator from './FloatEstimator';
import QuickStartCards from '@/components/home/QuickStartCards';
import FeaturedRivers from '@/components/home/FeaturedRivers';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

export default async function Home() {
  const rivers = await getRivers();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Hero */}
      <section className="relative py-6 md:py-10 text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <Image
            src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
            alt="Eddy the Otter"
            width={200}
            height={200}
            className="mx-auto h-40 md:h-52 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)] mb-1"
            priority
          />
          <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
            Eddy
          </h1>
          <p className="text-sm text-white/50">
            {rivers.length} rivers tracked &middot; Updated every hour &middot; Live USGS data
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="flex-1 py-6 md:py-8">
        <div className="max-w-5xl mx-auto px-4 space-y-8">
          {/* Quick-Start Cards */}
          <QuickStartCards />

          {/* Featured Rivers Spotlight */}
          <FeaturedRivers />

          {/* Float Estimator */}
          <FloatEstimator rivers={rivers} />

          {/* Browse All Rivers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
                All Rivers
              </h2>
              <Link
                href="/rivers"
                className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                Explore
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {rivers.map(river => {
                const condCode = river.currentCondition?.code ?? 'unknown';
                const dotColor = CONDITION_COLORS[condCode] || CONDITION_COLORS.unknown;
                return (
                  <Link
                    key={river.id}
                    href={`/rivers/${river.slug}`}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-full text-sm font-medium text-neutral-700 hover:border-primary-300 hover:shadow-sm transition-all no-underline"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    {river.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* About data */}
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 md:p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-2">About This Data</h3>
            <p className="text-sm text-neutral-700 leading-relaxed">
              All gauge data is provided by the <strong>United States Geological Survey (USGS)</strong> through
              their Water Services API. Readings are updated hourly and typically lag real-time conditions by
              15-60 minutes.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
