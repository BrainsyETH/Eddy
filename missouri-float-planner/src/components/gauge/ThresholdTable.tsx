'use client';

// src/components/gauge/ThresholdTable.tsx
// Reference list of what each water level means for floating.
//
// This used to also draw a segmented bar with a needle at the current reading —
// a second answer to "where am I" a screen-length away from the reading card's
// own condition strip. The track now lives on the reading card, next to the
// number it qualifies, and this component does one job: list the bands.
//
// Collapsed by default. It is reference material, not part of the decision.

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import {
  buildZones,
  formatZoneRange,
  type ThresholdDescriptions,
  type ThresholdValues,
} from '@/lib/gauge/threshold-zones';

interface ThresholdTableProps extends ThresholdValues {
  thresholdUnit: 'ft' | 'cfs';
  altThresholds?: ThresholdValues | null;
  altUnit?: 'ft' | 'cfs';
  thresholdDescriptions?: ThresholdDescriptions | null;
  currentCondition?: string;
}

export default function ThresholdTable({
  thresholdUnit,
  levelTooLow,
  levelLow,
  levelOptimalMin,
  levelOptimalMax,
  levelHigh,
  levelDangerous,
  altThresholds,
  altUnit,
  thresholdDescriptions,
  currentCondition,
}: ThresholdTableProps) {
  const hasAlt = Boolean(altThresholds && altUnit && (
    altThresholds.levelTooLow !== null ||
    altThresholds.levelLow !== null ||
    altThresholds.levelOptimalMin !== null ||
    altThresholds.levelOptimalMax !== null ||
    altThresholds.levelHigh !== null ||
    altThresholds.levelDangerous !== null
  ));

  const [isOpen, setIsOpen] = useState(false);
  const [showingAlt, setShowingAlt] = useState(false);

  const activeUnit = showingAlt && hasAlt ? altUnit! : thresholdUnit;
  const tv: ThresholdValues = showingAlt && hasAlt ? altThresholds! : {
    levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous,
  };

  const zones = buildZones(tv, thresholdDescriptions);
  if (zones.length === 0) return null;

  return (
    <Card variant="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="threshold-levels"
          className="group flex min-w-0 items-center gap-2 text-left"
        >
          <div className="min-w-0">
            <h3 className="text-base font-bold text-neutral-900 group-hover:text-primary-700">
              What the levels mean
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              <abbr title="feet" className="no-underline">ft</abbr> = gauge height &middot;{' '}
              <abbr title="cubic feet per second" className="no-underline">cfs</abbr> = flow rate
            </p>
          </div>
          {isOpen
            ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-neutral-500" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-500" aria-hidden="true" />}
        </button>

        {hasAlt && isOpen && (
          <Segmented
            aria-label="Threshold unit"
            options={[
              { value: 'primary', label: thresholdUnit === 'ft' ? 'Gauge (ft)' : 'Flow (cfs)' },
              { value: 'alt', label: altUnit === 'ft' ? 'Gauge (ft)' : 'Flow (cfs)' },
            ]}
            value={showingAlt ? 'alt' : 'primary'}
            onChange={(unit) => setShowingAlt(unit === 'alt')}
          />
        )}
      </div>

      {isOpen && (
        <div id="threshold-levels" className="divide-y divide-neutral-100 border-t border-neutral-100">
          {zones.map((zone) => {
            const isActive = currentCondition === zone.key;
            return (
              <div key={zone.key} className={`px-5 py-3 ${isActive ? 'bg-primary-50/60' : ''}`}>
                <div className="mb-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: zone.color }}
                    />
                    <span className="text-sm font-semibold text-neutral-900">{zone.label}</span>
                    {isActive && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-primary-700">
                        You are here
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs tabular-nums text-neutral-500">
                    {formatZoneRange(zone, activeUnit)}
                  </span>
                </div>
                <p className="ml-[18px] text-xs leading-relaxed text-neutral-500">
                  {zone.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
