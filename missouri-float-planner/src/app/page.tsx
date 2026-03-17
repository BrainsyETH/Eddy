// src/app/page.tsx
// Landing page for Eddy (server-rendered with client islands)

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, Activity } from 'lucide-react';
import { getRivers } from '@/lib/data/rivers';
import { buildRiversSummary } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';
import FloatEstimator from './FloatEstimator';
import EddysReport from './EddysReport';

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

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Clock className="w-4 h-4" />
              <span>Float Time Estimates</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Activity className="w-4 h-4" />
              <span>Accurate River Conditions</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <MapPin className="w-4 h-4" />
              <span>Detailed Access Points</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="flex-1 py-8 md:py-10">
        <div className="max-w-5xl mx-auto px-4 space-y-8">
          {/* Eddy Says Dashboard — full width, primary */}
          <EddysReport rivers={rivers} fallbackSummary={fallbackSummary} />

          {/* Float Estimator — secondary */}
          <div>
            <h2 className="text-xl font-bold text-neutral-800 mb-3">Plan Your Float</h2>
            <FloatEstimator rivers={rivers} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Safety Disclaimer */}
          <div className="mb-4 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
            <p className="text-sm text-primary-100 text-center">
              <strong className="text-white">Safety First:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
            </p>
          </div>

          {/* Footer Links */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-primary-200">
            <div className="flex items-center gap-4">
              <p>Eddy &middot; Water data from USGS</p>
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
              <Link href="/embed" className="hover:text-white transition-colors">Embed Widgets</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            </div>
            <p className="text-center md:text-right text-primary-300">
              &copy; {new Date().getFullYear()} eddy.guide &middot; For informational purposes only
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
