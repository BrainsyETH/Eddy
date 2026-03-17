'use client';

// EddysReport — Eddy Says conditions dashboard
// Full-width stacked river cards with river selector dropdown

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverListItem, ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const VERDICT_MAP: Record<ConditionCode, { text: string; color: string }> = {
  optimal:   { text: 'Float!',  color: '#059669' },
  okay:      { text: 'Float',   color: '#84cc16' },
  low:       { text: 'Low',     color: '#eab308' },
  too_low:   { text: 'Wait',    color: '#9ca3af' },
  high:      { text: 'Caution', color: '#f97316' },
  dangerous: { text: 'Closed',  color: '#ef4444' },
  unknown:   { text: '—',       color: '#9ca3af' },
};

interface EddysReportProps {
  rivers: RiverListItem[];
  fallbackSummary: string | null;
}

export default function EddysReport({ rivers, fallbackSummary }: EddysReportProps) {
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
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

  const summaryText = globalQuote || fallbackSummary;
  const displayRivers = selectedRiver === 'all'
    ? rivers
    : rivers.filter(r => r.slug === selectedRiver);

  return (
    <div className="glass-card-dark rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-5 lg:p-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <Image
            src={EDDY_CANOE_IMAGE}
            alt="Eddy the Otter"
            width={120}
            height={120}
            className="w-12 h-12 md:w-14 md:h-14 object-contain"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl lg:text-2xl font-bold text-white">Eddy Says</h2>
            {globalQuoteAge && (
              <span className="text-[10px] text-white/40">{globalQuoteAge}</span>
            )}
          </div>
        </div>

        {/* Global summary quote */}
        {summaryText && (
          <p className="text-sm md:text-base text-white/80 leading-relaxed mb-4">
            &ldquo;{summaryText}&rdquo;
          </p>
        )}

        {/* River selector */}
        <div className="relative">
          <select
            value={selectedRiver}
            onChange={(e) => setSelectedRiver(e.target.value)}
            className="w-full appearance-none bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500/50"
          >
            <option value="all" className="bg-primary-800 text-white">All Rivers</option>
            {rivers.map(r => (
              <option key={r.slug} value={r.slug} className="bg-primary-800 text-white">
                {r.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
        </div>
      </div>

      {/* River cards */}
      <div className="divide-y divide-white/5">
        {displayRivers.map(river => {
          const code = river.currentCondition?.code ?? 'unknown';
          const verdict = VERDICT_MAP[code];
          const blurb = CONDITION_CARD_BLURBS[code];
          const dotColor = CONDITION_COLORS[code];

          return (
            <Link
              key={river.id}
              href={`/rivers/${river.slug}`}
              className="flex items-center gap-3 px-5 lg:px-6 py-4 hover:bg-white/5 transition-colors no-underline group"
            >
              {/* Condition dot */}
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor }}
              />

              {/* River info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white text-sm md:text-base truncate">
                    {river.name}
                  </span>
                  <span
                    className="text-xs font-bold flex-shrink-0"
                    style={{ color: verdict.color }}
                  >
                    {verdict.text}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-white/50 truncate mt-0.5">
                  {blurb}
                </p>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
            </Link>
          );
        })}

        {displayRivers.length === 0 && (
          <div className="px-5 py-8 text-center text-white/40 text-sm">
            No river data available
          </div>
        )}
      </div>
    </div>
  );
}
