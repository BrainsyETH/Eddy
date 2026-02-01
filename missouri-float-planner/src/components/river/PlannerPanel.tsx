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
  river,
  accessPoints,
  isLoading,
  selectedPutIn,
  selectedTakeOut,
  onPutInChange,
  onTakeOutChange,
}: PlannerPanelProps) {
  const selectedPutInPoint = selectedPutIn
    ? accessPoints.find((point) => point.id === selectedPutIn)
    : null;

  return (
    <div className="glass-card-dark rounded-2xl p-4 lg:p-5 border border-white/10">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="lg:flex lg:items-end lg:gap-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 lg:mb-0 lg:shrink-0">
            <Image
              src={EDDY_CANOE_IMAGE}
              alt="Eddy the Otter in a canoe"
              width={120}
              height={120}
              className="w-10 h-10 md:w-12 md:h-12 object-contain"
            />
            <h2 className="text-lg lg:text-xl font-bold text-white">Plan Your Float</h2>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1">
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1">
                Put-in Point
              </label>
              <AccessPointSelector
                accessPoints={accessPoints}
                selectedId={selectedPutIn}
                onSelect={onPutInChange}
                placeholder="Select put-in..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1">
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
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
