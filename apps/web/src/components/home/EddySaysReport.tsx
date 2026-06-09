'use client';

// src/components/home/EddySaysReport.tsx
// Overall Eddy Says report for the landing page — fetches the global summary

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { getEddyImageForCondition } from '@/constants';
import { buildRiversSummary } from '@/data/eddy-quotes';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';

function formatGeneratedAge(isoString: string | null): string | null {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export default function EddySaysReport() {
  const { riverGroups, isLoading: groupsLoading } = useRiverGroups();
  const [globalUpdate, setGlobalUpdate] = useState<{ quoteText: string; summaryText: string | null; generatedAt: string | null } | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch global Eddy update
  useEffect(() => {
    let cancelled = false;
    async function fetchGlobal() {
      try {
        const res = await fetch('/api/eddy-update/global');
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setGlobalUpdate({
            quoteText: data.update.quoteText,
            summaryText: data.update.summaryText,
            generatedAt: data.update.generatedAt,
          });
        }
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGlobal();
    return () => { cancelled = true; };
  }, []);

  if (loading || groupsLoading) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 md:p-6 shadow-sm animate-pulse">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-neutral-200 rounded-full" />
          <div className="flex-1 min-w-0">
            <div className="h-3 bg-neutral-200 rounded w-16 mb-2.5" />
            <div className="h-3.5 bg-neutral-100 rounded w-full mb-1.5" />
            <div className="h-3.5 bg-neutral-100 rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback to buildRiversSummary if no global update
  const fallbackText = buildRiversSummary(
    riverGroups.map(rg => rg.condition.code)
  );

  const displayText = globalUpdate
    ? (showFull || !globalUpdate.summaryText ? globalUpdate.quoteText : globalUpdate.summaryText)
    : fallbackText;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 md:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 relative">
          <Image
            src={getEddyImageForCondition('flowing')}
            alt="Eddy"
            fill
            className="object-contain"
            sizes="40px"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-wide uppercase text-neutral-400">Eddy says</span>
            {globalUpdate?.generatedAt && (
              <span className="text-[10px] text-neutral-400">&middot; {formatGeneratedAge(globalUpdate.generatedAt)}</span>
            )}
          </div>
          <p className="text-sm text-neutral-700 leading-relaxed font-medium">
            &ldquo;{displayText}&rdquo;
          </p>
          {globalUpdate?.summaryText && (
            <button
              onClick={() => setShowFull(!showFull)}
              aria-expanded={showFull}
              aria-label={showFull ? 'Show less of Eddy report' : 'Show full Eddy report'}
              className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-600 transition-colors mt-1.5"
            >
              {showFull ? <>Less <ChevronUp className="w-2.5 h-2.5" aria-hidden="true" /></> : <>Full report <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
