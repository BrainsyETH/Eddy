'use client';

// src/components/river/PlannerPanel.tsx
// Primary planning interaction panel

import { useState } from 'react';
import dynamic from 'next/dynamic';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import type { RiverWithDetails, AccessPoint } from '@/types/api';

const AccessPointSelector = dynamic(() => import('@/components/river/AccessPointSelector'), {
  ssr: false,
});

interface PlannerPanelProps {
  river: RiverWithDetails;
  accessPoints: AccessPoint[];
  isLoading: boolean;
}

export default function PlannerPanel({
  river,
  accessPoints,
  isLoading,
}: PlannerPanelProps) {
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(null);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(null);
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const { data: vesselTypes } = useVesselTypes();

  // Set default vessel type
  if (vesselTypes && vesselTypes.length > 0 && !selectedVesselTypeId) {
    const defaultVessel = vesselTypes.find(v => v.slug === 'canoe') || vesselTypes[0];
    setSelectedVesselTypeId(defaultVessel.id);
  }

  // Calculate plan
  const planParams =
    selectedPutIn && selectedTakeOut
      ? {
          riverId: river.id,
          startId: selectedPutIn,
          endId: selectedTakeOut,
          vesselTypeId: selectedVesselTypeId || undefined,
        }
      : null;

  const { data: plan, isLoading: planLoading } = useFloatPlan(planParams);

  // Auto-show plan when both selected
  if (selectedPutIn && selectedTakeOut && !showPlan) {
    setShowPlan(true);
  }

  const handleShare = async () => {
    if (!planParams) return;

    try {
      const response = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planParams),
      });

      if (!response.ok) throw new Error('Failed to save plan');

      const { url } = await response.json();
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard! 🎉');
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
              onSelect={setSelectedPutIn}
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
              onSelect={setSelectedTakeOut}
              placeholder="Select take-out point..."
              excludeId={selectedPutIn}
            />
          </div>

          {/* Plan Summary */}
          {showPlan && (
            <div className="border-t border-white/10 pt-6">
              <PlanSummary
                plan={plan || null}
                isLoading={planLoading}
                onClose={() => {
                  setShowPlan(false);
                  setSelectedPutIn(null);
                  setSelectedTakeOut(null);
                }}
                onShare={handleShare}
              />
            </div>
          )}

          {/* Instructions */}
          {!selectedPutIn && (
            <div className="glass-bg-soft rounded-xl p-4 text-sm text-river-gravel border border-white/10">
              <p className="font-medium mb-1 text-white">👆 Get Started</p>
              <p>Select a put-in and take-out point above to calculate your float plan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
