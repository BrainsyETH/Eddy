'use client';

// src/components/river/PlannerPanel.tsx
// Simplified planning panel with just put-in/take-out selectors
// Float details now live in the FloatPlanCard component

import dynamic from 'next/dynamic';
import Image from 'next/image';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { RiverWithDetails, AccessPoint } from '@/types/api';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const AccessPointSelector = dynamic(() => import('@/components/river/AccessPointSelector'), {
  ssr: false,
});

interface PlannerPanelProps {
  river: RiverWithDetails;
  accessPoints: AccessPoint[];
  isLoading: boolean;
  // Controlled state from parent
  selectedPutIn: string | null;
  selectedTakeOut: string | null;
  onPutInChange: (id: string | null) => void;
  onTakeOutChange: (id: string | null) => void;
}

export default function PlannerPanel({
  river: _river,
  accessPoints,
  isLoading,
  selectedPutIn,
  selectedTakeOut,
  onPutInChange,
  onTakeOutChange,
}: PlannerPanelProps) {
  // river prop kept for interface compatibility
  void _river;
  const selectedPutInPoint = selectedPutIn
    ? accessPoints.find((point) => point.id === selectedPutIn)
    : null;

  return (
    <div className="glass-card-dark rounded-2xl p-3 lg:p-4 border border-white/10">
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="lg:flex lg:items-end lg:gap-3">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 lg:mb-0 lg:shrink-0">
            <Image
              src={EDDY_CANOE_IMAGE}
              alt="Eddy the Otter in a canoe"
              width={120}
              height={120}
              className="w-8 h-8 md:w-10 md:h-10 object-contain"
            />
            <h2 className="text-base lg:text-lg font-bold text-white">Plan Your Float</h2>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:flex-1">
            <div>
              <label className="block text-[11px] font-semibold text-white/80 mb-0.5">
                Put-in Point
              </label>
              <AccessPointSelector
                accessPoints={accessPoints}
                selectedId={selectedPutIn}
                onSelect={onPutInChange}
                placeholder="Select put-in..."
                compact
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/80 mb-0.5">
                Take-out Point
              </label>
              <AccessPointSelector
                accessPoints={accessPoints}
                selectedId={selectedTakeOut}
                onSelect={onTakeOutChange}
                placeholder="Select take-out..."
                excludeId={selectedPutIn}
                referenceMile={selectedPutInPoint?.riverMile ?? null}
                warnUpstream={Boolean(selectedPutInPoint)}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
