'use client';

// src/components/home/EddySaysReport.tsx
// "Eddy's Rising Rivers" — a live rundown of the rivers currently running high
// or at flood stage, computed from the shared gauge data (useRiverGroups) so it
// reflects conditions at this moment. When nothing is elevated it falls back to
// an all-clear message. Pairs with RiverMapFeature in the home 2-col band.

import { type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { EDDY_IMAGES } from '@/constants';
import { conditionDef } from '@shared/condition-system';
import { formatRiverLevel, type RiverGroup } from '@/lib/river-groups';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import ConditionBadge from '@/components/ui/ConditionBadge';

// Cap the list so a basin-wide flood can't run the card off the page.
const MAX_RISING = 5;

// Eddy-voiced caption for the rundown. Deterministic (it always matches the live
// list), but it names the worst river and adapts to how many are flooding vs
// merely high, so it reads like Eddy talking rather than a status line. Assumes
// at least one rising river — the caller renders the all-clear copy otherwise.
function buildRisingCaption(rising: RiverGroup[]): string {
  const floods = rising.filter((rg) => rg.condition.code === 'dangerous');
  const highs = rising.filter((rg) => rg.condition.code === 'high');
  const parts: string[] = [];

  if (floods.length > 0) {
    parts.push(
      floods.length === 1
        ? `${floods[0].riverName} is at flood stage. Stay off it until levels drop.`
        : `${floods.length} rivers are at flood stage, including ${floods[0].riverName}. Stay off them until levels drop.`,
    );
    if (highs.length === 1) {
      parts.push(`${highs[0].riverName} is running high too, so use caution there.`);
    } else if (highs.length > 1) {
      parts.push(`${highs.length} more are running high, so use caution on those.`);
    }
  } else {
    parts.push(
      highs.length === 1
        ? `${highs[0].riverName} is running high right now. Use caution and check before you launch.`
        : `${highs.length} rivers are running high right now, including ${highs[0].riverName}. Use caution and check before you launch.`,
    );
  }

  return parts.join(' ');
}

// Gradient-framed white card shell shared by every state so the loading,
// error, and populated views stay pixel-identical.
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-[240px] rounded-2xl p-[3px] shadow-soft-md" style={{ background: 'linear-gradient(135deg, #F07052 0%, #2D7889 100%)' }}>
      <div className="h-full bg-white rounded-[13px] p-5 md:p-6 flex flex-col">
        {children}
      </div>
    </div>
  );
}

// Red-flag Eddy + title. The red flag is this card's identity — it's the
// statewide "watch" for elevated water.
function Header() {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex-shrink-0 w-10 h-10 relative">
        <Image src={EDDY_IMAGES.red} alt="Eddy waving a red flag" fill className="object-contain" sizes="40px" />
      </div>
      <h2 className="text-base font-bold text-neutral-900 leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
        Eddy&apos;s Rising Rivers
      </h2>
    </div>
  );
}

export default function EddySaysReport() {
  const { riverGroups, isLoading } = useRiverGroups();

  if (isLoading) {
    return (
      <Shell>
        <div className="animate-pulse flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 bg-neutral-200 rounded-full" />
            <div className="h-4 bg-neutral-200 rounded w-40" />
          </div>
          <div className="h-3.5 bg-neutral-100 rounded w-full mb-2" />
          <div className="h-3.5 bg-neutral-100 rounded w-3/4" />
        </div>
      </Shell>
    );
  }

  // No river data at all (fetch failed or nothing configured) — don't imply an
  // all-clear we can't vouch for.
  if (riverGroups.length === 0) {
    return (
      <Shell>
        <Header />
        <p className="text-sm text-neutral-500">
          Couldn&apos;t load the latest river levels. Please try again shortly.
        </p>
      </Shell>
    );
  }

  // Rivers at or above "high", worst (flood) first via the canonical severity.
  const rising = riverGroups
    .filter((rg) => rg.condition.code === 'high' || rg.condition.code === 'dangerous')
    .sort((a, b) => conditionDef(a.condition.code).severity - conditionDef(b.condition.code).severity);

  const shown = rising.slice(0, MAX_RISING);
  const overflow = rising.length - shown.length;

  return (
    <Shell>
      <Header />

      {rising.length === 0 ? (
        // Fallback — nothing elevated statewide.
        <p className="text-sm text-neutral-700 leading-relaxed font-medium">
          Good news, no rivers are running high or flooding right now. Levels are sitting floatable or lower across the Ozarks. Give your put-in a look before you launch.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-700 leading-relaxed font-medium mb-3">
            {buildRisingCaption(rising)}
          </p>
          <ul className="flex flex-col gap-0.5">
            {shown.map((rg) => {
              const level = formatRiverLevel(rg);
              const row = (
                <>
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                      {rg.riverName}
                    </span>
                    {level && <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0">{level}</span>}
                  </span>
                  <ConditionBadge code={rg.condition.code} size="sm" />
                </>
              );
              return rg.riverSlug ? (
                <li key={rg.riverId}>
                  <Link
                    href={`/rivers/${rg.riverSlug}`}
                    data-ga-event="rising_river"
                    data-ga-label={rg.riverSlug}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-neutral-50 transition-colors no-underline"
                  >
                    {row}
                  </Link>
                </li>
              ) : (
                <li key={rg.riverId} className="flex items-center justify-between gap-3 px-2 py-1.5 -mx-2">
                  {row}
                </li>
              );
            })}
          </ul>
          {overflow > 0 && (
            <p className="text-xs text-neutral-400 mt-2">+{overflow} more rivers</p>
          )}
        </>
      )}

      <Link
        href="/rivers"
        data-ga-event="eddy_other_rivers"
        className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700 transition-colors no-underline"
      >
        See conditions on every river <ArrowRight className="w-4 h-4" />
      </Link>
    </Shell>
  );
}
