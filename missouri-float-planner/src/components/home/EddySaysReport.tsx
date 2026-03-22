'use client';

// src/components/home/EddySaysReport.tsx
// Full Eddy Says report for the landing page — fetches real updates per river

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS, RIVER_NOTES } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

interface EddyUpdate {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
}

export default function EddySaysReport() {
  const { riverGroups, isLoading } = useRiverGroups();
  const [updates, setUpdates] = useState<Record<string, EddyUpdate>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Fetch Eddy updates for all rivers
  useEffect(() => {
    if (riverGroups.length === 0) return;
    let cancelled = false;

    async function fetchAll() {
      const results: Record<string, EddyUpdate> = {};
      await Promise.all(
        riverGroups.map(async (rg) => {
          if (!rg.riverSlug) return;
          try {
            const res = await fetch(`/api/eddy-update/${rg.riverSlug}`);
            if (!res.ok) return;
            const data: EddyUpdateResponse = await res.json();
            if (data.available && data.update) {
              results[rg.riverSlug] = {
                quoteText: data.update.quoteText,
                summaryText: data.update.summaryText,
                conditionCode: data.update.conditionCode,
              };
            }
          } catch { /* silent */ }
        })
      );
      if (!cancelled) setUpdates(results);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [riverGroups]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-neutral-100 rounded-lg h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (riverGroups.length === 0) return null;

  return (
    <div className="space-y-3">
      {riverGroups.map((rg) => {
        const update = rg.riverSlug ? updates[rg.riverSlug] : null;
        const condCode = (update?.conditionCode as ConditionCode) || rg.condition.code;
        const bgClass = BG_BY_CONDITION[condCode] ?? BG_BY_CONDITION.unknown;
        const textClass = TEXT_BY_CONDITION[condCode] ?? TEXT_BY_CONDITION.unknown;
        const label = LABEL_BY_CONDITION[condCode] ?? LABEL_BY_CONDITION.unknown;
        const isExpanded = rg.riverSlug ? expanded[rg.riverSlug] : false;

        // Build fallback text
        const fallbackParts: string[] = [];
        if (rg.primaryGauge.gaugeHeightFt !== null) {
          fallbackParts.push(`Reading ${rg.primaryGauge.gaugeHeightFt.toFixed(1)} ft.`);
        }
        fallbackParts.push(CONDITION_CARD_BLURBS[rg.condition.code] || CONDITION_CARD_BLURBS.unknown);
        if (rg.riverSlug && RIVER_NOTES[rg.riverSlug]) {
          fallbackParts.push(RIVER_NOTES[rg.riverSlug]);
        }
        const fallbackText = fallbackParts.join(' ');

        const displayText = update?.summaryText && !isExpanded
          ? update.summaryText
          : update ? update.quoteText : fallbackText;

        const href = rg.riverSlug ? `/gauges/${rg.riverSlug}` : '#';

        return (
          <div key={rg.riverId} className={`border rounded-lg overflow-hidden ${bgClass}`}>
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <div className="flex-shrink-0 w-9 h-9 relative">
                <Image
                  src={getEddyImageForCondition(condCode)}
                  alt="Eddy"
                  fill
                  className="object-contain"
                  sizes="36px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-neutral-900">{rg.riverName}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${label.className}`}>
                    {label.text}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed font-medium ${textClass} ${!isExpanded && update?.summaryText ? 'line-clamp-2' : ''}`}>
                  &ldquo;{displayText}&rdquo;
                </p>
                {update?.summaryText && (
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [rg.riverSlug!]: !isExpanded }))}
                    className={`flex items-center gap-1 text-[10px] font-semibold transition-colors mt-0.5 ${textClass} opacity-60 hover:opacity-100`}
                  >
                    {isExpanded ? <>Less <ChevronUp className="w-2.5 h-2.5" /></> : <>More <ChevronDown className="w-2.5 h-2.5" /></>}
                  </button>
                )}
              </div>
              <Link
                href={href}
                className="flex-shrink-0 mt-1 text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
