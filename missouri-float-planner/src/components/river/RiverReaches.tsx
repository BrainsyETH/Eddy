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

function milesLabel(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  if (start == null) return `to mile ${end}`;
  if (end == null) return `mile ${start} down`;
  return `miles ${start}–${end}`;
}

export default function RiverReaches({ reaches }: { reaches: RiverReach[] }) {
  if (reaches.length < 2) return null;

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
            <li key={reach.sectionSlug} className="px-4 py-4">
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
