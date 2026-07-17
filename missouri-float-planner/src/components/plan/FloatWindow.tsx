'use client';

// src/components/plan/FloatWindow.tsx
// "Is Saturday good?" — a five-day strip of condition dots for the selected
// river: today classified from the live reading, future days from the NWS
// AHPS stage forecast at the river's primary gauge, both through the same
// classifyStageFromThresholds engine every other surface uses.
//
// Honesty rules: days without forecast coverage show a dash, not a guess;
// cfs-rated gauges (AHPS forecasts stage, not flow) only get a forecast dot
// when the flood-stage override kicks in, otherwise dashes plus today.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { conditionColor, conditionDef } from '@shared/condition-system';
import { classifyStageFromThresholds } from '@/lib/usgs/mo-statewide-data';
import type { ConditionCode } from '@/types/api';
import { useStatewideConditions } from '@/hooks/useStatewideConditions';
import type { MoForecastResponse } from '@/app/api/usgs/mo-forecast/route';

const DAY_COUNT = 5;

function useMoForecast() {
  return useQuery<MoForecastResponse, Error>({
    queryKey: ['mo-forecast'],
    queryFn: async () => {
      const res = await fetch('/api/usgs/mo-forecast');
      if (!res.ok) throw new Error('Failed to fetch forecast');
      return (await res.json()) as MoForecastResponse;
    },
    staleTime: 30 * 60 * 1000, // server payload is CDN-cached for an hour
    refetchOnWindowFocus: false,
  });
}

interface DayCell {
  label: string;
  verdict: ConditionCode | null;
}

export default function FloatWindow({ riverSlug }: { riverSlug: string }) {
  const { rivers, gauges } = useStatewideConditions();
  const { data: forecast } = useMoForecast();

  const model = useMemo(() => {
    const river = rivers?.find((r) => r.slug === riverSlug);
    const primary = (river?.gauges ?? []).find((g) => g.is_primary);
    if (!river || !primary) return null;

    const reading = gauges?.find((g) => g.site_no === primary.site_id);
    const entry = forecast?.entries.find((e) => e.site_no === primary.site_id);

    const days: DayCell[] = [];
    const now = new Date();

    for (let i = 0; i < DAY_COUNT; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const label =
        i === 0 ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' });

      if (i === 0) {
        // Today: live reading, identical classification to the map network.
        let verdict: ConditionCode | null = null;
        if (reading) {
          const stageFt = reading.gaugeHeightFt ?? null;
          const value =
            primary.threshold_unit === 'ft' ? stageFt : reading.dischargeCfs ?? null;
          const v = classifyStageFromThresholds(value, primary.threshold_unit, primary, stageFt);
          verdict = v === 'unknown' ? null : v;
        }
        days.push({ label, verdict });
        continue;
      }

      // Future days: peak forecast stage within the local calendar day —
      // peak (not mean) so a rising river biases toward caution.
      const dayStart = day.getTime();
      const dayEnd = dayStart + 24 * 3600 * 1000;
      let maxFt: number | null = null;
      for (const d of entry?.stages ?? []) {
        const t = Date.parse(d.dateTime);
        if (Number.isNaN(t) || t < dayStart || t >= dayEnd) continue;
        if (maxFt == null || d.valueFt > maxFt) maxFt = d.valueFt;
      }
      if (maxFt == null) {
        days.push({ label, verdict: null });
        continue;
      }
      const v = classifyStageFromThresholds(
        primary.threshold_unit === 'ft' ? maxFt : null,
        primary.threshold_unit,
        primary,
        maxFt,
      );
      days.push({ label, verdict: v === 'unknown' ? null : v });
    }

    const forecastDays = days.slice(1).filter((d) => d.verdict !== null).length;
    return { gaugeName: primary.name, days, forecastDays };
  }, [rivers, gauges, forecast, riverSlug]);

  if (!model) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Float window
        </p>
        <p className="truncate text-[10px] text-neutral-400">NWS · {model.gaugeName}</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {model.days.map((d, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 rounded-lg bg-neutral-50 px-1 py-1.5"
            title={d.verdict ? `${d.label}: ${conditionDef(d.verdict).label}` : `${d.label}: no forecast`}
          >
            <span className="text-[10px] font-semibold text-neutral-500">{d.label}</span>
            {d.verdict ? (
              <span
                className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: conditionColor(d.verdict) }}
                aria-label={conditionDef(d.verdict).label}
              />
            ) : (
              <span className="text-xs leading-[0.875rem] text-neutral-300" aria-label="No forecast">
                —
              </span>
            )}
          </div>
        ))}
      </div>
      {model.forecastDays === 0 && (
        <p className="mt-1.5 text-[10px] text-neutral-400">
          No NWS stage forecast for this gauge — showing today only.
        </p>
      )}
    </div>
  );
}
