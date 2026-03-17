'use client';

// EddysReport — client island for the home page Eddy quote card
// Receives a server-computed fallback summary, fetches AI quote client-side

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

const EDDY_FLOOD_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png';

interface EddysReportProps {
  fallbackSummary: string | null;
}

export default function EddysReport({ fallbackSummary }: EddysReportProps) {
  const [globalQuote, setGlobalQuote] = useState<string | null>(null);
  const [globalQuoteAge, setGlobalQuoteAge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchGlobalQuote() {
      try {
        const res = await fetch('/api/eddy-update/global');
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setGlobalQuote(data.update.quoteText);
          const hours = (Date.now() - new Date(data.update.generatedAt).getTime()) / (1000 * 60 * 60);
          if (hours < 1) setGlobalQuoteAge('Updated just now');
          else if (hours < 2) setGlobalQuoteAge('Updated 1 hr ago');
          else setGlobalQuoteAge(`Updated ${Math.round(hours)} hrs ago`);
        }
      } catch {
        // Silently fail — static fallback will be used
      }
    }
    fetchGlobalQuote();
    return () => { cancelled = true; };
  }, []);

  const eddySummaryText = globalQuote || fallbackSummary;

  return (
    <div className="flex flex-col glass-card-dark rounded-2xl p-5 lg:p-6 border border-white/10">
      <div className="flex items-center gap-3 mb-4">
        <Image
          src={EDDY_FLOOD_IMAGE}
          alt="Eddy the Otter checking water levels"
          width={120}
          height={120}
          className="w-12 h-12 md:w-14 md:h-14 object-contain"
        />
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-white">Eddy&apos;s Report</h2>
          {globalQuoteAge && (
            <span className="text-[10px] text-white/40">{globalQuoteAge}</span>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center">
        <p className="text-sm md:text-base text-white/90 leading-relaxed font-medium">
          {eddySummaryText
            ? <>&ldquo;{eddySummaryText}&rdquo;</>
            : <span className="text-white/40">Loading conditions...</span>
          }
        </p>
      </div>

      <Link
        href="/gauges"
        className="group flex items-center justify-center gap-2 mt-4 px-5 py-3 rounded-xl text-sm font-semibold text-white no-underline transition-colors"
        style={{ backgroundColor: '#F07052' }}
      >
        Check Conditions
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  );
}
