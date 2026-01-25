'use client';

// src/components/river/PlannerPanel.tsx
// Primary planning interaction panel
// State is lifted to parent (RiverPage) to enable map integration

import dynamic from 'next/dynamic';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { RiverWithDetails, AccessPoint, FloatPlan } from '@/types/api';

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
}: PlannerPanelProps) {
  const selectedPutInPoint = selectedPutIn
    ? accessPoints.find((point) => point.id === selectedPutIn)
    : null;

  const handleShare = async () => {
    if (!selectedPutIn || !selectedTakeOut) return;

    try {
      const response = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riverId: river.id,
          startId: selectedPutIn,
          endId: selectedTakeOut,
        }),
      });

      if (!response.ok) throw new Error('Failed to save plan');

      const { url } = await response.json();
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    } catch (error) {
      console.error('Error sharing plan:', error);
      alert('Failed to create shareable link');
    }
  };

  return (
    <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
      <h2 className="text-2xl font-bold text-white mb-4">Plan Your Float</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Put-in Selector */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Put-in Point
            </label>
            <AccessPointSelector
              accessPoints={accessPoints}
              selectedId={selectedPutIn}
              onSelect={onPutInChange}
              placeholder="Select put-in point..."
            />
          </div>

          {/* Take-out Selector */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
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

          {/* Plan Summary */}
          {showPlan && (
            <div className="border-t border-white/10 pt-6">
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
              <p className="font-medium mb-1 text-white">👆 Get Started</p>
              <p>Select a put-in and take-out point above to calculate your float plan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
