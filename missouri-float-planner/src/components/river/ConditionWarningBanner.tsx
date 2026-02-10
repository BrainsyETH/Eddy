// src/components/river/ConditionWarningBanner.tsx
// Safety warning banner for high water and flood conditions

import { AlertTriangle, XOctagon } from 'lucide-react';
import type { RiverCondition } from '@/types/api';

interface ConditionWarningBannerProps {
  condition: RiverCondition | null;
  riverName: string;
}

export default function ConditionWarningBanner({ condition, riverName }: ConditionWarningBannerProps) {
  if (!condition) return null;

  if (condition.code === 'dangerous') {
    return (
      <div className="bg-red-600 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <XOctagon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">
              Flood Conditions &mdash; Do Not Float
            </p>
            <p className="text-sm text-red-100">
              {riverName} is at {condition.gaugeHeightFt !== null ? `${condition.gaugeHeightFt.toFixed(1)} ft` : 'dangerous levels'}
              {condition.gaugeName ? ` (${condition.gaugeName})` : ''}.
              {' '}Water levels are at flood stage. Contact local outfitters for updates.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (condition.code === 'high') {
    return (
      <div className="bg-orange-500 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">
              High Water Warning
            </p>
            <p className="text-sm text-orange-100">
              {riverName} is at {condition.gaugeHeightFt !== null ? `${condition.gaugeHeightFt.toFixed(1)} ft` : 'high levels'}
              {condition.gaugeName ? ` (${condition.gaugeName})` : ''}.
              {' '}Not recommended for inexperienced floaters. River closures may be in effect.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
