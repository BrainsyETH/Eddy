'use client';

// EddysReport — Eddy Says conditions dashboard
// Clean white card with scrollable pill bar river selector

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverListItem, ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const VERDICT_MAP: Record<ConditionCode, { text: string; color: string }> = {
  optimal:   { text: 'Float!',  color: '#059669' },
  okay:      { text: 'Float',   color: '#65a30d' },
  low:       { text: 'Low',     color: '#ca8a04' },
  too_low:   { text: 'Wait',    color: '#6b7280' },
  high:      { text: 'Caution', color: '#ea580c' },
  dangerous: { text: 'Closed',  color: '#dc2626' },
  unknown:   { text: '—',       color: '#6b7280' },
};

interface EddysReportProps {
  rivers: RiverListItem[];
  fallbackSummary: string | null;
}

export default function EddysReport({ rivers, fallbackSummary }: EddysReportProps) {
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
  const [globalQuote, setGlobalQuote] = useState<string | null>(null);
  const [globalQuoteAge, setGlobalQuoteAge] = useState<string | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

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
    <div className="glass-card rounded-2xl overflow-hidden">
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
            <h2 className="text-xl lg:text-2xl font-bold text-neutral-800">Eddy Says</h2>
            {globalQuoteAge && (
              <span className="text-[10px] text-neutral-400">{globalQuoteAge}</span>
            )}
          </div>
        </div>

        {/* Global summary quote */}
        {summaryText && (
          <p className="text-sm md:text-base text-neutral-600 leading-relaxed mb-4">
            &ldquo;{summaryText}&rdquo;
          </p>
        )}

        {/* Scrollable pill bar */}
        <div
          ref={pillsRef}
          className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 lg:-mx-6 lg:px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <button
            onClick={() => setSelectedRiver('all')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedRiver === 'all'
                ? 'text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            style={selectedRiver === 'all' ? { backgroundColor: '#F07052' } : undefined}
          >
            All Rivers
          </button>
          {rivers.map(r => (
            <button
              key={r.slug}
              onClick={() => setSelectedRiver(r.slug)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedRiver === r.slug
                  ? 'text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              style={selectedRiver === r.slug ? { backgroundColor: '#F07052' } : undefined}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* River cards */}
      <div className="divide-y divide-neutral-100">
        {displayRivers.map(river => {
          const code = river.currentCondition?.code ?? 'unknown';
          const verdict = VERDICT_MAP[code];
          const blurb = CONDITION_CARD_BLURBS[code];
          const dotColor = CONDITION_COLORS[code];

          return (
            <Link
              key={river.id}
              href={`/rivers/${river.slug}`}
              className="flex items-center gap-3 px-5 lg:px-6 py-4 hover:bg-neutral-50 transition-colors no-underline group"
            >
              {/* Condition dot */}
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor }}
              />

              {/* River info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-neutral-800 text-sm md:text-base truncate">
                    {river.name}
                  </span>
                  <span
                    className="text-xs font-bold flex-shrink-0"
                    style={{ color: verdict.color }}
                  >
                    {verdict.text}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-neutral-400 truncate mt-0.5">
                  {blurb}
                </p>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
            </Link>
          );
        })}

        {displayRivers.length === 0 && (
          <div className="px-5 py-8 text-center text-neutral-400 text-sm">
            No river data available
          </div>
        )}
      </div>
    </div>
  );
}
