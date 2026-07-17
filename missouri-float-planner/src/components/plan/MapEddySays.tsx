'use client';

// src/components/plan/MapEddySays.tsx
// Top-center "Eddy Says — River Report" overlay for the planner map. Moved
// out of the sidebar so it sits where the put-in/take-out instructions used
// to be — a collapsed pill by default, expandable into the full river
// report (EddyQuote) right over the map.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { ChevronDown, ChevronUp, Camera } from 'lucide-react';
import { getEddyImageForCondition } from '@/constants';
import type { ConditionCode } from '@/types/api';

const EddyQuote = dynamic(() => import('@/components/river/EddyQuote'), { ssr: false });

interface MapEddySaysProps {
  riverSlug: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  onSubmitPhoto?: () => void;
}

export default function MapEddySays({
  riverSlug,
  conditionCode,
  gaugeHeightFt,
  onSubmitPhoto,
}: MapEddySaysProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 left-1/2 z-20 w-[92%] -translate-x-1/2 sm:w-[380px] pointer-events-auto">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur-sm">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2.5 transition-colors hover:bg-neutral-50"
        >
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt="Eddy"
            width={22}
            height={22}
            className="flex-shrink-0"
          />
          <span className="text-xs font-semibold text-neutral-800">Eddy Says — River Report</span>
          {open ? (
            <ChevronUp size={14} className="ml-auto text-neutral-400" />
          ) : (
            <ChevronDown size={14} className="ml-auto text-neutral-400" />
          )}
        </button>

        {open && (
          <div className="max-h-[55vh] overflow-y-auto border-t border-neutral-100">
            <EddyQuote
              riverSlug={riverSlug}
              conditionCode={conditionCode}
              gaugeHeightFt={gaugeHeightFt}
              embedded
            />
            {onSubmitPhoto && (
              <button
                onClick={onSubmitPhoto}
                className="flex w-full items-center justify-center gap-2 border-t border-neutral-100 px-3 py-2 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50"
              >
                <Camera size={13} />
                Show us what the river looks like
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
