// src/components/river/RiverReaches.tsx
// The two-hydrologies panel on a river hub — for a river that behaves like two
// different rivers along its length.
//
// The Black is the case this exists for: Clearwater Dam sits in the middle of
// one rivers row. Above it is a spring-fed float out of Lesterville that
// responds to rain and springs; below it is a flood-control tailwater set by the
// Corps' release schedule, which can rise fast and cold under a blue sky. One
// condition badge for the whole river would be wrong for one of those halves
// whichever way it read.
//
// This deliberately does NOT split the river into two entries. Someone driving
// to the Black is going to the Black — one page, one slug, one search result.
// The difference belongs inside that page, which is what this panel is.
//
// Server component, fed by fetchRiverReaches() in the page's existing
// Promise.all so it stays inside the hub's revalidate window. Returns null for
// every river without reach data, which is most of them.

import { Waves } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { riverTypeLabel, type RiverReach } from '@/lib/data/river-reaches';

/** Matches EddyQuote's generated-age phrasing so the two read as one voice. */
function formatAge(generatedAt: string): string {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins < 2 ? 'updated just now' : `updated ${mins}m ago`;
  }
  if (hours < 2) return 'updated 1 hr ago';
  if (hours < 24) return `updated ${Math.round(hours)} hrs ago`;
  return `updated ${Math.floor(hours / 24)}d ago`;
}

function milesLabel(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  if (start == null) return `to mile ${end}`;
  if (end == null) return `mile ${start} down`;
  return `miles ${start}–${end}`;
}

/**
 * A stable id for one reach, so it can be linked to directly.
 *
 * Exported because a linker and a target that disagree produce a hash that
 * scrolls nowhere, which is indistinguishable from a working link.
 */
export function reachAnchorId(sectionSlug: string): string {
  return `reach-${sectionSlug}`;
}

export default function RiverReaches({
  reaches,
  /**
   * The reach the reader arrived for, when the referrer knew — a dam passing
   * `tailwater.sectionSlug`.
   *
   * Mirrors the iOS panel. Highlighting rather than scrolling for the same
   * reason: a reader arriving from Clearwater Dam lands on a river page that
   * leads with the spring-fed Lesterville float, which the dam has no bearing
   * on, and the question is WHICH half they came for — not how to get down the
   * page to it.
   */
  highlightSlug,
}: {
  reaches: RiverReach[];
  highlightSlug?: string | null;
}) {
  if (reaches.length < 2) return null;

  // Only when it matches something. A slug for a reach this river does not
  // carry highlights nothing rather than defaulting to the first.
  const highlighted = reaches.some((r) => r.sectionSlug === highlightSlug)
    ? highlightSlug
    : null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
        <p className="text-sm text-neutral-600">
          This river reads differently along its length, so each reach is gauged
          on its own. Check the one you are actually floating.
        </p>
      </div>

      <ul className="divide-y divide-neutral-200">
        {reaches.map((reach) => {
          const miles = milesLabel(reach.riverMileStart, reach.riverMileEnd);
          return (
            <li
              key={reach.sectionSlug}
              // Deep-linkable, and `scroll-mt` clears the hub's sticky section
              // nav so a hash landing does not park the heading underneath it.
              id={reachAnchorId(reach.sectionSlug)}
              className={
                reach.sectionSlug === highlighted
                  ? 'scroll-mt-24 border-l-4 border-primary-700 bg-primary-50/40 px-4 py-4'
                  : 'scroll-mt-24 px-4 py-4'
              }
            >
              {reach.sectionSlug === highlighted && (
                <p className="mb-1 text-xs font-semibold text-primary-700">
                  The reach the dam above controls
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h3 className="font-semibold text-neutral-900">{reach.name}</h3>
                <ConditionBadge code={reach.conditionCode} size="sm" uppercase />
                {/* Only chip the hydrology where it actually differs from the
                    river's — on an ordinary river it would be noise. */}
                {reach.differsFromRiver && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 border border-sky-200">
                    <Waves className="w-3 h-3" aria-hidden="true" />
                    {riverTypeLabel(reach.riverType)}
                  </span>
                )}
              </div>

              {reach.description && (
                <p className="text-sm text-neutral-600 mb-2">{reach.description}</p>
              )}

              {/* This reach's own Eddy report, read through its own gauge. */}
              {reach.report && (
                <blockquote className="mb-2 border-l-2 border-primary-300 pl-3">
                  <p className="text-sm text-neutral-700 italic">
                    &ldquo;{reach.report.summaryText || reach.report.quoteText}&rdquo;
                  </p>
                  <cite className="not-italic text-[11px] text-neutral-500">
                    Eddy on this reach &middot; {formatAge(reach.report.generatedAt)}
                  </cite>
                </blockquote>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                {reach.gaugeName && (
                  <span>
                    Gauge: <span className="text-neutral-700">{reach.gaugeName}</span>
                  </span>
                )}
                {reach.gaugeHeightFt != null && (
                  <span>{reach.gaugeHeightFt.toFixed(1)} ft</span>
                )}
                {reach.dischargeCfs != null && (
                  <span>{Math.round(reach.dischargeCfs).toLocaleString()} cfs</span>
                )}
                {miles && <span>{miles}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
