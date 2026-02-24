'use client';

// src/components/river/EddyQuote.tsx
// Eddy's daily conditions quote — speech bubble with otter avatar.
// Replaces the interactive chat and local knowledge modal.

import Image from 'next/image';
import type { ConditionCode } from '@/types/api';
import { buildEddyQuote, RIVER_KNOWLEDGE } from '@/data/eddy-quotes';
import type { WeatherInput } from '@/data/eddy-quotes';

interface EddyQuoteProps {
  riverSlug: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  weather?: WeatherInput | null;
  readingAgeHours?: number | null;
}

const BG_BY_CONDITION: Record<string, string> = {
  optimal: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200',
  okay: 'bg-gradient-to-r from-emerald-50 to-cyan-50 border-emerald-200',
  low: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200',
  too_low: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200',
  high: 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200',
  dangerous: 'bg-gradient-to-r from-red-100 to-red-50 border-red-300',
  unknown: 'bg-gradient-to-r from-neutral-50 to-slate-50 border-neutral-200',
};

const TEXT_BY_CONDITION: Record<string, string> = {
  optimal: 'text-emerald-900',
  okay: 'text-emerald-900',
  low: 'text-amber-900',
  too_low: 'text-orange-900',
  high: 'text-red-900',
  dangerous: 'text-red-900',
  unknown: 'text-neutral-700',
};

const LABEL_BY_CONDITION: Record<string, { text: string; className: string }> = {
  optimal: { text: 'Optimal', className: 'bg-emerald-100 text-emerald-700' },
  okay: { text: 'Okay', className: 'bg-emerald-100 text-emerald-700' },
  low: { text: 'Low', className: 'bg-amber-100 text-amber-700' },
  too_low: { text: 'Too Low', className: 'bg-orange-100 text-orange-700' },
  high: { text: 'High', className: 'bg-red-100 text-red-700' },
  dangerous: { text: 'Flood', className: 'bg-red-200 text-red-800' },
  unknown: { text: 'Unknown', className: 'bg-neutral-100 text-neutral-600' },
};

function formatReadingAge(hours: number): string {
  if (hours < 1) return 'Updated just now';
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export default function EddyQuote({ riverSlug, conditionCode, gaugeHeightFt, weather, readingAgeHours }: EddyQuoteProps) {
  const quote = buildEddyQuote(riverSlug, conditionCode, gaugeHeightFt, weather);
  const knowledge = RIVER_KNOWLEDGE[riverSlug];
  const bgClass = BG_BY_CONDITION[conditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[conditionCode] ?? TEXT_BY_CONDITION.unknown;
  const label = LABEL_BY_CONDITION[conditionCode] ?? LABEL_BY_CONDITION.unknown;

  return (
    <div className={`border rounded-xl overflow-hidden ${bgClass}`}>
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-4">
        {/* Eddy avatar */}
        <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 relative">
          <Image
            src={quote.eddyImage}
            alt="Eddy the Otter"
            fill
            className="object-contain"
            sizes="56px"
          />
        </div>

        {/* Speech bubble */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold tracking-wide uppercase opacity-60">Eddy says</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${label.className}`}>
              {label.text}
            </span>
            {readingAgeHours != null && (
              <span className="text-[10px] text-neutral-400 ml-auto">
                {formatReadingAge(readingAgeHours)}
              </span>
            )}
          </div>
          <p className={`text-sm sm:text-base leading-relaxed font-medium ${textClass}`}>
            &ldquo;{quote.text}&rdquo;
          </p>
          {knowledge && (
            <p className="text-xs mt-1.5 opacity-50">
              Optimal range: {knowledge.optimalRange} &middot; {knowledge.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
