'use client';

// src/app/plan/[shortCode]/page.tsx
// Shareable plan view page

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { EDDY_IMAGES } from '@/constants';
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
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <div className="min-h-[60vh] bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md w-full rounded-2xl border-[3px] border-neutral-900 bg-white p-8 shadow-[6px_6px_0_#0F2D35]">
          <Image
            src={EDDY_IMAGES.flag}
            alt="Eddy the otter"
            width={80}
            height={80}
            className="mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold text-neutral-900 mb-3" style={{ fontFamily: 'var(--font-display)' }}>Plan Not Found</h1>
          <p className="text-neutral-600 mb-6">{error}</p>
          <Link
            href="/plan"
            className="inline-block px-5 py-2.5 rounded-lg border-2 border-neutral-900 bg-accent-500 text-white text-sm font-bold no-underline shadow-[3px_3px_0_#0F2D35] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#0F2D35] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Plan a new float
          </Link>
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
      {/* Non-blocking "copied" toast (replaces a blocking alert()) */}
      {copied && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-neutral-900 bg-neutral-900 text-white text-sm font-bold shadow-[3px_3px_0_#4EB86B]"
        >
          <Check size={16} className="text-support-400" />
          Link copied to clipboard
        </div>
      )}

      {/* Plan title bar */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b-[3px] border-neutral-900">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image src={EDDY_IMAGES.canoe} alt="" width={32} height={32} className="flex-shrink-0 object-contain hidden sm:block" />
            <h1 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
              Float Plan &middot; {plan.river.name}
            </h1>
          </div>
          <Link
            href={`/plan?river=${plan.river.slug}`}
            className="flex-shrink-0 inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold text-white no-underline border-2 border-neutral-900 bg-accent-500 shadow-[3px_3px_0_#0F2D35] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#0F2D35] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Plan your own float
          </Link>
        </div>
      </div>

      {/* Plan Summary - full width on top */}
      <div className="flex-shrink-0 bg-neutral-50 border-b-[3px] border-neutral-900">
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
      <footer className="flex-shrink-0 bg-primary-800 border-t-[3px] border-neutral-900 px-4 py-3">
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
