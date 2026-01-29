'use client';

// src/components/river/PlannerPanel.tsx
// Primary planning interaction panel
// State is lifted to parent (RiverPage) to enable map integration
// Users can select via dropdown OR by clicking map markers

import dynamic from 'next/dynamic';
import Image from 'next/image';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { RiverWithDetails, AccessPoint, FloatPlan } from '@/types/api';

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
  // Plan data from parent
  plan: FloatPlan | null;
  planLoading: boolean;
  showPlan: boolean;
  onShowPlanChange: (show: boolean) => void;
  vesselTypeId: string | null;
}

export default function PlannerPanel({
  river,
  accessPoints,
  isLoading,
  selectedPutIn,
  selectedTakeOut,
  onPutInChange,
  onTakeOutChange,
  plan,
  planLoading,
  showPlan,
  onShowPlanChange,
  vesselTypeId,
}: PlannerPanelProps) {
  const selectedPutInPoint = selectedPutIn
    ? accessPoints.find((point) => point.id === selectedPutIn)
    : null;

  const handleShare = async () => {
    if (!selectedPutIn || !selectedTakeOut || !vesselTypeId) return;

    try {
      const response = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riverId: river.id,
          startId: selectedPutIn,
          endId: selectedTakeOut,
          vesselTypeId,
        }),
      });

      if (!response.ok) throw new Error('Failed to save plan');

      const { url } = await response.json();
      const isMobile = window.matchMedia('(pointer: coarse)').matches;

      // Mobile: use native share sheet. Desktop: copy to clipboard.
      if (isMobile && navigator.share) {
        try {
          await navigator.share({
            title: `Float Plan - ${river.name}`,
            url,
          });
          return;
        } catch {
          // User cancelled or share failed, fall through to clipboard
        }
      }

      try {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
      } catch {
        window.prompt('Copy this link:', url);
      }
    } catch (error) {
      console.error('Error sharing plan:', error);
      alert('Failed to create shareable link');
    }
  };

  return (
    <div className="glass-card-dark rounded-2xl p-4 lg:p-6 border border-white/10">
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header + Selectors - horizontal on desktop */}
          <div className="lg:flex lg:items-end lg:gap-4">
            <div className="flex items-center gap-2 mb-3 lg:mb-0 lg:shrink-0">
              <Image
                src={EDDY_CANOE_IMAGE}
                alt="Eddy the Otter in a canoe"
                width={120}
                height={120}
                className="w-10 h-10 md:w-14 md:h-14 object-contain"
              />
              <h2 className="text-xl lg:text-2xl font-bold text-white">Plan Your Float</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1">
              <div>
                <label className="block text-sm font-semibold text-white mb-1.5">
                  Put-in Point
                </label>
                <AccessPointSelector
                  accessPoints={accessPoints}
                  selectedId={selectedPutIn}
                  onSelect={onPutInChange}
                  placeholder="Select put-in point..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-1.5">
                  Take-out Point
                </label>
                <AccessPointSelector
                  accessPoints={accessPoints}
                  selectedId={selectedTakeOut}
                  onSelect={onTakeOutChange}
                  placeholder="Select take-out point..."
                  excludeId={selectedPutIn}
                  referenceMile={selectedPutInPoint?.riverMile ?? null}
                  warnUpstream={Boolean(selectedPutInPoint)}
                />
              </div>
            </div>
          </div>

          {/* Plan Summary - full width, horizontal on desktop */}
          {showPlan && (
            <div className="border-t border-white/10 pt-4">
              <PlanSummary
                plan={plan}
                isLoading={planLoading}
                onClose={() => {
                  onShowPlanChange(false);
                  onPutInChange(null);
                  onTakeOutChange(null);
                }}
                onShare={handleShare}
              />
            </div>
          )}

          {/* Instructions */}
          {!selectedPutIn && (
            <div className="bg-primary-700/30 rounded-xl p-4 text-sm text-primary-200 border border-primary-600/30">
              <p className="font-medium mb-1 text-white">Get Started</p>
              <p>Select access points using the dropdowns above or click markers on the map.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
