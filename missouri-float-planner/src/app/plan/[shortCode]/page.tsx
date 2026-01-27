'use client';

// src/app/plan/[shortCode]/page.tsx
// Shareable plan view page

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { FloatPlan } from '@/types/api';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });

export default function SharedPlanPage() {
  const params = useParams();
  const shortCode = params.shortCode as string;

  const [plan, setPlan] = useState<FloatPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlan() {
      try {
        const response = await fetch(`/api/plan/${shortCode}`);
        if (!response.ok) {
          throw new Error('Plan not found');
        }
        const data = await response.json();
        setPlan(data.plan);
      } catch {
        setError('This plan could not be found or has expired.');
      } finally {
        setIsLoading(false);
      }
    }

    if (shortCode) {
      fetchPlan();
    }
  }, [shortCode]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard! 🎉');
    } catch {
      alert('Failed to copy link');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-neutral-600">Loading your float plan...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-[60vh] bg-neutral-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">😕</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">Plan Not Found</h1>
          <p className="text-neutral-600 mb-6">{error}</p>
        </div>
      </div>
    );
  }

  // Create access points array from plan
  const accessPoints = [plan.putIn, plan.takeOut];
  const bounds = plan.route.geometry
    ? calculateBoundsFromGeometry(plan.route.geometry)
    : undefined;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Plan title bar */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b-2 border-neutral-200 text-center">
        <h1 className="text-lg font-bold text-neutral-900">Float Plan &middot; {plan.river.name}</h1>
      </div>

      {/* Mobile: stacked layout that scrolls naturally. Desktop: side-by-side fixed height. */}
      <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
        {/* Plan Summary */}
        <div className="w-full lg:w-96 bg-white lg:border-r border-neutral-200 lg:overflow-y-auto">
          <div className="max-w-lg mx-auto lg:max-w-none p-6">
            <PlanSummary
              plan={plan}
              isLoading={false}
              onClose={() => {}}
              onShare={handleShare}
            />
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative min-h-[400px] lg:min-h-0">
          <MapContainer initialBounds={bounds} showLegend={true}>
            <AccessPointMarkers
              accessPoints={accessPoints}
              selectedPutIn={plan.putIn.id}
              selectedTakeOut={plan.takeOut.id}
            />
          </MapContainer>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-primary-800 border-t-2 border-neutral-900 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-primary-200">
          <p>Float MO &middot; Water data from USGS</p>
          <p className="hidden md:block">Always check local conditions before floating</p>
        </div>
      </footer>
    </div>
  );
}

// Helper to calculate bounds from geometry
function calculateBoundsFromGeometry(
  geometry: GeoJSON.LineString
): [number, number, number, number] | undefined {
  if (!geometry.coordinates || geometry.coordinates.length === 0) {
    return undefined;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const coord of geometry.coordinates) {
    const [lng, lat] = coord;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  // Add some padding
  const padding = 0.02;
  return [
    minLng - padding,
    minLat - padding,
    maxLng + padding,
    maxLat + padding,
  ];
}
