'use client';

// EddysReport — Eddy Says conditions dashboard
// Clean white card showing all rivers with condition verdicts
// Fetches per-river AI summaries and shows them truncated (like river pages)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { RiverListItem, ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const VERDICT_MAP: Record<ConditionCode, { text: string; color: string }> = {
  flowing:   { text: 'Float!',  color: '#059669' },
  good:      { text: 'Float',   color: '#65a30d' },
  low:       { text: 'Low',     color: '#ca8a04' },
  too_low:   { text: 'Wait',    color: '#9ca3af' },
  high:      { text: 'Caution', color: '#ea580c' },
  dangerous: { text: 'Closed',  color: '#dc2626' },
  unknown:   { text: '—',       color: '#6b7280' },
};

interface EddysReportProps {
  rivers: RiverListItem[];
  fallbackSummary: string | null;
}

type RiverAiData = Record<string, { summaryText: string | null; quoteText: string }>;

export default function EddysReport({ rivers, fallbackSummary }: EddysReportProps) {
  const [globalQuote, setGlobalQuote] = useState<string | null>(null);
  const [globalQuoteAge, setGlobalQuoteAge] = useState<string | null>(null);
  const [riverAi, setRiverAi] = useState<RiverAiData>({});

  useEffect(() => {
    let cancelled = false;

    // Fetch global quote
    async function fetchGlobalQuote() {
      try {
        const res = await fetch('/api/eddy-update/global');
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setGlobalQuote(data.update.summaryText || data.update.quoteText);
          const hours = (Date.now() - new Date(data.update.generatedAt).getTime()) / (1000 * 60 * 60);
          if (hours < 1) setGlobalQuoteAge('Updated just now');
          else if (hours < 2) setGlobalQuoteAge('Updated 1 hr ago');
          else setGlobalQuoteAge(`Updated ${Math.round(hours)} hrs ago`);
        }
      } catch {
        // Silently fail — static fallback will be used
      }
    }

    // Fetch per-river AI summaries
    async function fetchRiverSummaries() {
      const results: RiverAiData = {};
      await Promise.allSettled(
        rivers.map(async (river) => {
          try {
            const res = await fetch(`/api/eddy-update/${river.slug}`);
            if (!res.ok) return;
            const data: EddyUpdateResponse = await res.json();
            if (data.available && data.update) {
              results[river.slug] = {
                summaryText: data.update.summaryText,
                quoteText: data.update.quoteText,
              };
            }
          } catch {
            // Skip — will fall back to static blurb
          }
        })
      );
      if (!cancelled) setRiverAi(results);
    }

    fetchGlobalQuote();
    fetchRiverSummaries();
    return () => { cancelled = true; };
  }, [rivers]);

  const summaryText = globalQuote || fallbackSummary;

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
          <p className="text-sm md:text-base text-neutral-600 leading-relaxed">
            &ldquo;{summaryText}&rdquo;
          </p>
        )}
      </div>

      {/* River cards */}
      <div className="divide-y divide-neutral-100">
        {rivers.map(river => {
          const code = river.currentCondition?.code ?? 'unknown';
          const verdict = VERDICT_MAP[code];
          const dotColor = CONDITION_COLORS[code];

          // Use AI summary if available, otherwise fall back to static blurb
          const ai = riverAi[river.slug];
          const blurb = ai?.summaryText || ai?.quoteText || CONDITION_CARD_BLURBS[code];

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
                <p className="text-xs md:text-sm text-neutral-400 line-clamp-2 mt-0.5">
                  {ai ? `\u201C${blurb}\u201D` : blurb}
                </p>
              </div>

              {/* Details link */}
              <span className="flex items-center gap-0.5 text-xs text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0">
                Details
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          );
        })}

        {rivers.length === 0 && (
          <div className="px-5 py-8 text-center text-neutral-400 text-sm">
            No river data available
          </div>
        )}
      </div>
    </div>
  );
}
