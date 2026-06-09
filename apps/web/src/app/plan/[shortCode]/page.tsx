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
const RouteLayer = dynamic(() => import('@/components/map/RouteLayer'), { ssr: false });

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
    const shareUrl = window.location.href;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    // Mobile: use native share sheet. Desktop: copy to clipboard.
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Float Plan - ${plan?.river.name ?? 'River'}`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    } catch {
      window.prompt('Copy this link:', shareUrl);
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
            <span className="text-3xl">:/</span>
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

      {/* Plan Summary - full width on top */}
      <div className="flex-shrink-0 bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <PlanSummary
            plan={plan}
            isLoading={false}
            onClose={() => {}}
            onShare={handleShare}
          />
        </div>
      </div>

      {/* Map - fills remaining space */}
      <main className="flex-1 relative min-h-[350px]">
        <MapContainer initialBounds={bounds} showLegend={true}>
          <RouteLayer routeGeometry={plan.route} />
          <AccessPointMarkers
            accessPoints={accessPoints}
            selectedPutIn={plan.putIn.id}
            selectedTakeOut={plan.takeOut.id}
          />
        </MapContainer>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-primary-800 border-t-2 border-neutral-900 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-primary-200">
          <p>Eddy &middot; Water data from USGS</p>
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
