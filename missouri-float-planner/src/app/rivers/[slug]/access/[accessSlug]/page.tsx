'use client';

// src/app/rivers/[slug]/access/[accessSlug]/page.tsx
// Access point detail page with navigation links, collapsible sections, and gauge status

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Share2, Copy } from 'lucide-react';
import { useAccessPointDetail } from '@/hooks/useAccessPointDetail';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AccessPointHeader from '@/components/access-point/AccessPointHeader';
import AccessPointNav from '@/components/access-point/AccessPointNav';
import AccessPointSection from '@/components/access-point/AccessPointSection';
import NearbyAccessPoints from '@/components/access-point/NearbyAccessPoints';
import RoadAccessSection from '@/components/access-point/sections/RoadAccessSection';
import ParkingSection from '@/components/access-point/sections/ParkingSection';
import FacilitiesSection from '@/components/access-point/sections/FacilitiesSection';
import OutfittersSection from '@/components/access-point/sections/OutfittersSection';
import RiverNotesSection from '@/components/access-point/sections/RiverNotesSection';
import { useCallback, useState } from 'react';

export default function AccessPointDetailPage() {
  const params = useParams();
  const riverSlug = params.slug as string;
  const accessSlug = params.accessSlug as string;

  const { data, isLoading, error } = useAccessPointDetail(riverSlug, accessSlug);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const shareUrl = window.location.href;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: data?.accessPoint.name || 'Access Point',
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
  }, [data?.accessPoint.name]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">:/</span>
          </div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Access Point Not Found</h2>
          <p className="text-neutral-600 mb-4">
            The access point you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href={`/rivers/${riverSlug}`}
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to river
          </Link>
        </div>
      </div>
    );
  }

  const { accessPoint, nearbyAccessPoints, gaugeStatus } = data;

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Sticky Header Bar - positioned below global site header (h-14 = 3.5rem) */}
      <div className="sticky top-14 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href={`/rivers/${riverSlug}`}
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{accessPoint.river.name}</span>
            <span className="sm:hidden">Back</span>
          </Link>

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <Copy className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Share
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {/* Header Card with Hero, Quick Stats, and Gauge */}
        <AccessPointHeader accessPoint={accessPoint} gaugeStatus={gaugeStatus} />

        {/* Navigation Buttons */}
        <AccessPointNav accessPoint={accessPoint} />

        {/* Collapsible Sections */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden divide-y divide-neutral-200">
          <AccessPointSection
            icon="🚗"
            title="Road Access"
            badge={accessPoint.roadSurface.length > 0 ? getRoadBadge(accessPoint.roadSurface) : null}
          >
            <RoadAccessSection accessPoint={accessPoint} />
          </AccessPointSection>

          <AccessPointSection icon="🅿️" title="Parking">
            <ParkingSection accessPoint={accessPoint} />
          </AccessPointSection>

          <AccessPointSection
            icon="🏕️"
            title="Facilities"
            badge={accessPoint.managingAgency ? { label: accessPoint.managingAgency, variant: 'success' } : null}
          >
            <FacilitiesSection accessPoint={accessPoint} />
          </AccessPointSection>

          {accessPoint.nearbyServices && accessPoint.nearbyServices.length > 0 && (
            <AccessPointSection icon="🛶" title="Outfitters">
              <OutfittersSection services={accessPoint.nearbyServices} />
            </AccessPointSection>
          )}

          {accessPoint.localTips && (
            <AccessPointSection icon="📝" title="River Notes">
              <RiverNotesSection tips={accessPoint.localTips} />
            </AccessPointSection>
          )}
        </div>

        {/* Nearby Access Points */}
        {nearbyAccessPoints.length > 0 && (
          <NearbyAccessPoints
            accessPoints={nearbyAccessPoints}
            riverSlug={riverSlug}
            riverName={accessPoint.river.name}
          />
        )}
      </div>
    </div>
  );
}

function getRoadBadge(surfaces: string[]): { label: string; variant: 'default' | 'warning' | 'success' } {
  // Priority: show most restrictive
  if (surfaces.includes('4wd_required')) return { label: '4WD', variant: 'warning' };
  if (surfaces.includes('seasonal')) return { label: 'SEASONAL', variant: 'warning' };
  if (surfaces.includes('dirt')) return { label: 'DIRT', variant: 'default' };
  if (surfaces.includes('gravel_unmaintained')) return { label: 'GRAVEL', variant: 'default' };
  if (surfaces.includes('gravel_maintained')) return { label: 'GRAVEL', variant: 'default' };
  if (surfaces.includes('paved')) return { label: 'PAVED', variant: 'success' };
  return { label: 'UNKNOWN', variant: 'default' };
}
