'use client';

// src/components/gauge/GaugeTabBar.tsx
// Horizontal tab bar for switching between gauges on a river

import { Star } from 'lucide-react';

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

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mb-px scrollbar-none">
      {gauges.map((gauge) => {
        const isActive = gauge.siteId === activeSiteId;
        return (
          <button
            key={gauge.siteId}
            onClick={() => onTabChange(gauge.siteId)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
              isActive
                ? 'border-primary-500 text-primary-700 bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {gauge.isPrimaryForRiver && (
              <Star className={`w-3.5 h-3.5 ${isActive ? 'text-primary-500' : 'text-neutral-400'}`} fill="currentColor" />
            )}
            {gauge.name}
          </button>
        );
      })}
    </div>
  );
}
