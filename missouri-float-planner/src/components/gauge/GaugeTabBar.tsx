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

/**
 * Strips the river name prefix and state suffix from USGS gauge names.
 * e.g. "Current River at Doniphan, MO" → "Doniphan"
 *      "Jacks Fork near Mountain View, MO" → "Mountain View"
 *      "Niangua River at Tunnel Dam near Macks Creek, MO" → "Tunnel Dam nr Macks Creek"
 */
function shortenGaugeName(fullName: string): string {
  // Remove state suffix (", MO" or similar)
  let name = fullName.replace(/,\s*[A-Z]{2}\s*$/, '');

  // Strip "[River Name] at/near/above " prefix
  // Match pattern: "Word(s) River/Creek/Fork at/near/above ..."
  const prefixMatch = name.match(/^.+?\b(?:River|Creek|Fork|Branch)\s+(?:at|near|above|below)\s+/i);
  if (prefixMatch) {
    name = name.slice(prefixMatch[0].length);
  }

  return name;
}

export default function GaugeTabBar({ gauges, activeSiteId, onTabChange }: GaugeTabBarProps) {
  if (gauges.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {gauges.map((gauge) => {
        const isActive = gauge.siteId === activeSiteId;
        const shortName = shortenGaugeName(gauge.name);
        return (
          <button
            key={gauge.siteId}
            onClick={() => onTabChange(gauge.siteId)}
            title={gauge.name}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {gauge.isPrimaryForRiver && (
              <Star className={`w-3 h-3 ${isActive ? 'text-white' : 'text-neutral-400'}`} fill="currentColor" />
            )}
            {shortName}
          </button>
        );
      })}
    </div>
  );
}
