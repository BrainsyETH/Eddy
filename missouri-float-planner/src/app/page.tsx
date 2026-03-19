// src/app/page.tsx
// Landing page for Eddy (server-rendered with client islands)

import Image from 'next/image';
import Link from 'next/link';
import { getRivers } from '@/lib/data/rivers';
import { buildRiversSummary } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';
import FloatEstimator from './FloatEstimator';
import EddysReport from './EddysReport';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

export default async function Home() {
  const rivers = await getRivers();

  // Compute fallback summary server-side
  const codes = rivers.map(r => (r.currentCondition?.code ?? null) as ConditionCode | null);
  const fallbackSummary = buildRiversSummary(codes);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Hero */}
      <section className="relative py-8 md:py-14 text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="mb-1">
            <Image
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
              alt="Eddy the Otter"
              width={200}
              height={200}
              className="mx-auto h-52 md:h-64 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
            Eddy
          </h1>

          {/* Feature subtitle */}
          <p className="text-sm text-white/50 mt-1">
            Conditions &middot; Float Times &middot; Access Points
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="flex-1 py-8 md:py-10">
        <div className="max-w-5xl mx-auto px-4 space-y-8">
          {/* Eddy Says Dashboard — full width, primary */}
          <EddysReport rivers={rivers} fallbackSummary={fallbackSummary} />

          {/* Ask Eddy CTA */}
          <Link
            href="/chat"
            className="block rounded-xl border-2 border-neutral-200 bg-white p-6 hover:border-primary-300 hover:shadow-md transition-all no-underline group"
          >
            <div className="flex items-center gap-4">
              <Image
                src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png"
                alt="Eddy"
                width={48}
                height={48}
                className="rounded-lg flex-shrink-0"
              />
              <div>
                <h2 className="text-lg font-bold text-neutral-800 group-hover:text-primary-700 transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                  Ask Eddy Anything
                </h2>
                <p className="text-sm text-neutral-500">
                  Which river should I float? Can I float this weekend? What outfitters are nearby? Eddy checks real-time conditions and helps you plan.
                </p>
              </div>
              <svg className="w-5 h-5 text-neutral-400 group-hover:text-primary-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Float Estimator — secondary */}
          <div>
            <h2 className="text-xl font-bold text-neutral-800 mb-3">Plan Your Float</h2>
            <FloatEstimator rivers={rivers} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
