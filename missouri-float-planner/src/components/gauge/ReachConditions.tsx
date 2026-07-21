'use client';

// src/components/gauge/ReachConditions.tsx
// One row per gauge on the river — the river isn't one number. Rendered only
// for multi-gauge rivers; each row shows that reach's canonical condition and
// doubles as the gauge switcher for the detail view. Purely presentational:
// the parent computes each gauge's condition with the shared condition system.

import ConditionBadge from '@/components/ui/ConditionBadge';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import type { ConditionCode } from '@/types/api';

export interface ReachRow {
  siteId: string;
  name: string;
  /** Pre-formatted reading, e.g. "2.89 ft · 987 cfs". Null when no data. */
  reading: string | null;
  code: ConditionCode;
  isPrimary: boolean;
}

interface ReachConditionsProps {
  rows: ReachRow[];
  activeSiteId: string | null;
  onSelect: (siteId: string) => void;
}

export default function ReachConditions({ rows, activeSiteId, onSelect }: ReachConditionsProps) {
  if (rows.length < 2) return null;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 sm:px-6 border-b border-neutral-100">
        <h3 className="text-sm font-semibold text-neutral-800">Conditions by gauge</h3>
      </div>
      <div className="divide-y divide-neutral-100">
        {rows.map((row) => {
          const isActive = row.siteId === activeSiteId;
          return (
            <button
              key={row.siteId}
              type="button"
              onClick={() => onSelect(row.siteId)}
              aria-pressed={isActive}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 sm:px-6 text-left transition-colors ${
                isActive ? 'bg-primary-50' : 'hover:bg-neutral-50'
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-900 truncate">
                  {shortenGaugeName(row.name)}
                </div>
                {row.reading && (
                  <div className="text-xs text-neutral-500 tabular-nums mt-0.5">{row.reading}</div>
                )}
              </div>
              <ConditionBadge code={row.code} size="sm" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
