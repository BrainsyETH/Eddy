'use client';

// src/components/river/RiverHazards.tsx
// The river page's hazards list — the readable version of the hazard markers
// on the access map, which keyboard and screen-reader users cannot reach.
//
// Same behaviour as the app's Hazards section (eddy-ios river/[slug].tsx):
// most dangerous first, the critical ones' severity dots visible while the
// section is closed, and open by default when anything critical is listed.
// Absent when the river has no hazards logged, as on iOS.

import { useHazards } from '@/hooks/useHazards';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import {
  criticalHazards,
  hazardConditionCode,
  hazardSummary,
  hazardTypeLabel,
  portageNote,
  severityLabel,
  sortHazards,
} from '@/lib/hazards/presentation';

function dotColor(severity: string): string {
  const code = hazardConditionCode(severity) as ConditionCode;
  return (CONDITION_SYSTEM[code] ?? CONDITION_SYSTEM.unknown).solid;
}

export default function RiverHazards({ riverSlug, className = '' }: { riverSlug: string; className?: string }) {
  const { data: hazards = [] } = useHazards(riverSlug);
  if (hazards.length === 0) return null;

  const sorted = sortHazards(hazards);
  const critical = criticalHazards(hazards);
  const dangerous = sorted.filter((h) => h.severity === 'danger');

  return (
    <section id="hazards" className={className} aria-labelledby="hazards-heading">
      <h2 id="hazards-heading" className="sr-only">Hazards</h2>
      <details className="card-panel group" open={critical.length > 0}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <EddyIcon name="hazard" size={22} />
          <span className="flex-1 text-base font-bold text-neutral-900">{hazardSummary(sorted)}</span>
          {/* The severity cue survives a closed section: a low-water dam should
              not hide behind a disclosure triangle. */}
          {dangerous.length > 0 && (
            <span className="flex gap-1" aria-label={`${dangerous.length} dangerous`}>
              {dangerous.slice(0, 4).map((h) => (
                <span key={h.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor(h.severity) }} />
              ))}
            </span>
          )}
          <span className="text-sm font-semibold text-primary-700 group-open:hidden">Show</span>
          <span className="hidden text-sm font-semibold text-primary-700 group-open:inline">Hide</span>
        </summary>
        <ul className="m-0 list-none border-t border-neutral-200 p-0">
          {sorted.map((hazard) => {
            const portage = portageNote(hazard);
            return (
              <li key={hazard.id} className="flex gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:px-5">
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor(hazard.severity) }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{hazard.name}</p>
                  <p className="text-xs text-neutral-500">
                    {severityLabel(hazard.severity)} · {hazardTypeLabel(hazard.type)} · mile {hazard.riverMile.toFixed(1)}
                  </p>
                  {portage && <p className="mt-1 text-sm font-medium text-neutral-800">{portage}</p>}
                  {hazard.description && <p className="mt-1 text-sm text-neutral-600">{hazard.description}</p>}
                  {hazard.seasonalNotes && <p className="mt-1 text-xs text-neutral-500">{hazard.seasonalNotes}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
