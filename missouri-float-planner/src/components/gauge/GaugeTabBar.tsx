'use client';

// src/components/gauge/GaugeTabBar.tsx
// Compact native selector for switching between gauges on a river.

import { ChevronDown } from 'lucide-react';
import { shortenGaugeName } from '@/lib/gauge/format-name';

interface GaugeTab {
  siteId: string;
  name: string;
  isPrimaryForRiver: boolean;
}

interface GaugeTabBarProps {
  gauges: GaugeTab[];
  activeSiteId: string;
  onTabChange: (siteId: string) => void;
}

export default function GaugeTabBar({ gauges, activeSiteId, onTabChange }: GaugeTabBarProps) {
  if (gauges.length <= 1) return null;

  const activeGauge = gauges.find((gauge) => gauge.siteId === activeSiteId);

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="hidden whitespace-nowrap font-sans text-[10px] font-bold uppercase tracking-wide text-neutral-500 lg:inline">
        USGS gauge
      </span>
      <span className="relative min-w-0">
        <select
          value={activeSiteId}
          onChange={(event) => onTabChange(event.target.value)}
          aria-label="USGS gauge"
          title={activeGauge?.name}
          className="h-9 max-w-[8.25rem] appearance-none truncate rounded-md border-2 border-primary-700 bg-white py-1 pl-2.5 pr-7 font-sans text-xs font-bold text-primary-900 shadow-[2px_2px_0_var(--color-primary-200)] outline-none transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 sm:max-w-[12rem]"
        >
          {gauges.map((gauge) => (
            <option key={gauge.siteId} value={gauge.siteId}>
              {shortenGaugeName(gauge.name)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary-700" strokeWidth={2.5} aria-hidden="true" />
      </span>
    </label>
  );
}
