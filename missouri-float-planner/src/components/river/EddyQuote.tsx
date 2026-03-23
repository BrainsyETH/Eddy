'use client';

// src/components/river/EddyQuote.tsx
// Eddy's conditions quote — speech bubble with otter avatar.
// Tries to fetch AI-generated update first, falls back to static templates.
// Supports summary/full toggle and share button.

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, Share2, Check } from 'lucide-react';
import type { ConditionCode } from '@/types/api';
import { buildEddyQuote, RIVER_NOTES } from '@/data/eddy-quotes';
import type { WeatherInput } from '@/data/eddy-quotes';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

interface EddyQuoteProps {
  riverSlug: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  weather?: WeatherInput | null;
  readingAgeHours?: number | null;
  /** Optimal range string built from DB thresholds, e.g. "3.5–6.0 ft" */
  optimalRange?: string | null;
}

import { getEddyImageForCondition } from '@/constants';

const BG_BY_CONDITION: Record<string, string> = {
  flowing: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200',
  good: 'bg-gradient-to-r from-emerald-50 to-cyan-50 border-emerald-200',
  low: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200',
  too_low: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200',
  high: 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200',
  dangerous: 'bg-gradient-to-r from-red-100 to-red-50 border-red-300',
  unknown: 'bg-gradient-to-r from-neutral-50 to-slate-50 border-neutral-200',
};

const TEXT_BY_CONDITION: Record<string, string> = {
  flowing: 'text-emerald-900',
  good: 'text-emerald-900',
  low: 'text-amber-900',
  too_low: 'text-orange-900',
  high: 'text-red-900',
  dangerous: 'text-red-900',
  unknown: 'text-neutral-700',
};

const LABEL_BY_CONDITION: Record<string, { text: string; className: string }> = {
  flowing: { text: 'Flowing', className: 'bg-emerald-100 text-emerald-700' },
  good: { text: 'Good', className: 'bg-emerald-100 text-emerald-700' },
  low: { text: 'Low', className: 'bg-amber-100 text-amber-700' },
  too_low: { text: 'Too Low', className: 'bg-orange-100 text-orange-700' },
  high: { text: 'High', className: 'bg-red-100 text-red-700' },
  dangerous: { text: 'Flood', className: 'bg-red-200 text-red-800' },
  unknown: { text: 'Unknown', className: 'bg-neutral-100 text-neutral-600' },
};

function formatReadingAge(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins < 2 ? 'Updated just now' : `Updated ${mins}m ago`;
  }
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function formatGeneratedAge(generatedAt: string): string {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins < 2 ? 'Updated just now' : `Updated ${mins}m ago`;
  }
  if (hours < 2) return 'Updated 1 hr ago';
  return `Updated ${Math.round(hours)} hrs ago`;
}

export default function EddyQuote({ riverSlug, conditionCode, gaugeHeightFt, weather, readingAgeHours, optimalRange }: EddyQuoteProps) {
  const [aiUpdate, setAiUpdate] = useState<EddyUpdateResponse['update']>(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');

  // Fetch AI-generated update on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchAiUpdate() {
      try {
        const res = await fetch(`/api/eddy-update/${riverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setAiUpdate(data.update);
        }
      } catch {
        // Silently fail — static fallback will be used
      } finally {
        if (!cancelled) setAiLoaded(true);
      }
    }

    fetchAiUpdate();
    return () => { cancelled = true; };
  }, [riverSlug]);

  // Share handler — only use native share on mobile (touch devices)
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/rivers/${riverSlug}`;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (isMobile && navigator.share) {
      const title = `River conditions on Eddy`;
      const text = aiUpdate?.summaryText || aiUpdate?.quoteText || 'Check the latest river conditions on Eddy';
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      // Clipboard failed
    }
  }, [riverSlug, aiUpdate]);

  // Determine which data to display
  const useAi = aiLoaded && aiUpdate !== null;
  const displayConditionCode = useAi
    ? (aiUpdate.conditionCode as ConditionCode)
    : conditionCode;

  // Static fallback
  const staticQuote = buildEddyQuote(riverSlug, conditionCode, gaugeHeightFt, weather, optimalRange);

  // Summary vs full text
  const hasSummary = useAi && aiUpdate.summaryText;
  const summaryText = hasSummary ? aiUpdate.summaryText : null;
  const fullText = useAi ? aiUpdate.quoteText : staticQuote.text;
  const displayText = hasSummary && !showFull ? summaryText! : fullText;

  const eddyImage = getEddyImageForCondition(displayConditionCode);
  const notes = RIVER_NOTES[riverSlug];

  const bgClass = BG_BY_CONDITION[displayConditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[displayConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const label = LABEL_BY_CONDITION[displayConditionCode] ?? LABEL_BY_CONDITION.unknown;

  // Age display: AI update shows generation time, static shows gauge reading age
  const ageDisplay = useAi
    ? formatGeneratedAge(aiUpdate.generatedAt)
    : readingAgeHours != null
      ? formatReadingAge(readingAgeHours)
      : null;

  return (
    <div className={`border rounded-xl overflow-hidden ${bgClass}`}>
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-4">
        {/* Eddy avatar */}
        <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 relative">
          <Image
            src={eddyImage}
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
            {ageDisplay && (
              <span className="text-[10px] text-neutral-500 ml-auto whitespace-nowrap">
                {ageDisplay}
              </span>
            )}
          </div>
          <p className={`text-sm sm:text-base leading-relaxed font-medium ${textClass}`}>
            &ldquo;{displayText}&rdquo;
          </p>

          {/* Toggle + Share row */}
          <div className="flex items-center gap-3 mt-1.5">
            {hasSummary && (
              <button
                onClick={() => setShowFull(!showFull)}
                className={`flex items-center gap-1 text-xs font-semibold transition-colors ${textClass} opacity-60 hover:opacity-100`}
              >
                {showFull ? (
                  <>Show less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Read more <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}

            {(optimalRange || notes) && !hasSummary && (
              <p className="text-xs opacity-50 flex-1">
                {optimalRange ? `Optimal range: ${optimalRange}` : ''}{optimalRange && notes ? ' \u00b7 ' : ''}{notes || ''}
              </p>
            )}

            {useAi && (
              <button
                onClick={handleShare}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-all ml-auto rounded-md px-2 py-1 ${
                  shareStatus === 'copied'
                    ? 'bg-emerald-100 text-emerald-700'
                    : `${textClass} opacity-50 hover:opacity-100 hover:bg-black/5`
                }`}
                title="Share this report"
              >
                {shareStatus === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {shareStatus === 'copied' ? 'Copied!' : 'Share'}
              </button>
            )}
          </div>

          {(optimalRange || notes) && hasSummary && showFull && (
            <p className="text-xs mt-1.5 opacity-50">
              {optimalRange ? `Optimal range: ${optimalRange}` : ''}{optimalRange && notes ? ' \u00b7 ' : ''}{notes || ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
