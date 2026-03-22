'use client';

// src/components/gauge/GaugeTabBar.tsx
// Pill-style wrapping buttons for switching between gauges on a river

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
    <div className="flex flex-wrap gap-2">
      {gauges.map((gauge) => {
        const isActive = gauge.siteId === activeSiteId;
        return (
          <button
            key={gauge.siteId}
            onClick={() => onTabChange(gauge.siteId)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {gauge.isPrimaryForRiver && (
              <Star className={`w-3 h-3 ${isActive ? 'text-white' : 'text-neutral-400'}`} fill="currentColor" />
            )}
            {gauge.name}
          </button>
        );
      })}
    </div>
  );
}
