'use client';

// src/components/home/FloatingWellNow.tsx
// Compact "floating well now" list for the landing page — live river conditions
// filtered to clean / floatable rivers. Pairs with RiverMapFeature in a 2-col
// band and replaces the larger FeaturedRivers chart cards on the home page.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS } from '@/constants';
import type { RiverGroup } from '@/lib/river-groups';

// Conditions considered "floating well" — clean and floatable.
const CLEAN_CODES = new Set<string>(['flowing', 'good']);
const MAX_ROWS = 5;

function formatLevel(river: RiverGroup): string | null {
  const { primaryGauge, primaryThreshold } = river;
  const isCfs = primaryThreshold?.thresholdUnit === 'cfs';
  const value = isCfs ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  if (value == null) return null;
  return isCfs ? `${Math.round(value).toLocaleString()} cfs` : `${value.toFixed(1)} ft`;
}

export default function FloatingWellNow() {
  const { riverGroups, isLoading, error } = useRiverGroups();

  // Distinguish a failed fetch from a genuinely-empty result: showing the
  // "no rivers reading clean" copy on an outage would be misleading.
  if (error) {
    return (
      <p className="text-sm text-neutral-500 py-8 text-center">
        Couldn&apos;t load live conditions right now. Please try again shortly.
      </p>
    );
  }

  if (isLoading) {
    return (
      <ul className="flex flex-col">
        {[0, 1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 py-3 border-b border-neutral-100 last:border-0 animate-pulse"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-200 flex-shrink-0" />
            <span className="h-4 bg-neutral-200 rounded w-32" />
            <span className="ml-auto h-4 bg-neutral-100 rounded w-14" />
          </li>
        ))}
      </ul>
    );
  }

  const clean = riverGroups
    .filter((g) => CLEAN_CODES.has(g.condition.code))
    .slice(0, MAX_ROWS);

  if (clean.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-8 text-center">
        No rivers reading clean right now — check back soon for live conditions.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {clean.map((river) => {
        const href = river.riverSlug ? `/rivers/${river.riverSlug}` : '#';
        const dotColor = CONDITION_COLORS[river.condition.code] || CONDITION_COLORS.unknown;
        const level = formatLevel(river);
        return (
          <li key={river.riverId}>
            <Link
              href={href}
              className="group flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg border-b border-neutral-100 last:border-0 no-underline hover:bg-neutral-50 transition-colors"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor }}
              />
              <span className="text-sm font-semibold text-neutral-800 truncate">
                {river.riverName}
              </span>
              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                {level && (
                  <span
                    className="text-sm font-bold text-neutral-900 tabular-nums"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {level}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
