// src/app/rivers/[state]/[slug]/access/[accessSlug]/page.tsx
// Access point detail page — server-rendered so the facility/parking/outfitter
// content is in the initial HTML (crawlable, no client fetch waterfall). Only
// the Share action is a client island.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getAccessPointDetail } from '@/lib/access-points/detail';
import AccessPointHeader from '@/components/access-point/AccessPointHeader';
import AccessPointNav from '@/components/access-point/AccessPointNav';
import AccessPointSection from '@/components/access-point/AccessPointSection';
import AccessPointShareButton from '@/components/access-point/AccessPointShareButton';
import NearbyAccessPoints from '@/components/access-point/NearbyAccessPoints';
import RoadAccessSection from '@/components/access-point/sections/RoadAccessSection';
import ParkingSection from '@/components/access-point/sections/ParkingSection';
import FacilitiesSection from '@/components/access-point/sections/FacilitiesSection';
import OutfittersSection from '@/components/access-point/sections/OutfittersSection';
import RiverNotesSection from '@/components/access-point/sections/RiverNotesSection';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

// Detail section icon URLs from Vercel blob storage
const DETAIL_ICONS = {
  road: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/road-icon.png',
  parking: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/parking-icon.png',
  facilities: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/restroom-icon.png',
};

interface Props {
  params: Promise<{ state: string; slug: string; accessSlug: string }>;
}

export default async function AccessPointDetailPage({ params }: Props) {
  const { state: stateSegment, slug: riverSlug, accessSlug } = await params;
  const riverHref = `/rivers/${stateSegment}/${riverSlug}`;

  const supabase = await createClient();
  const result = await getAccessPointDetail(supabase, riverSlug, accessSlug);

  if (!result.ok) {
    notFound();
  }

  const { accessPoint, nearbyAccessPoints, gaugeStatus } = result.data;

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Sticky sub-header — pinned at top-14 so it sits BELOW the 56px site
          header (sticky top-0 z-50) instead of being occluded behind it. */}
      <div className="sticky top-14 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Breadcrumbs
            items={[
              { label: 'Rivers', href: '/rivers' },
              { label: accessPoint.river.name, href: riverHref },
              { label: accessPoint.name },
            ]}
          />

          <AccessPointShareButton title={accessPoint.name} />
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
            iconUrl={DETAIL_ICONS.road}
            title="Road Access"
            badge={accessPoint.roadSurface.length > 0 ? getRoadBadge(accessPoint.roadSurface) : null}
          >
            <RoadAccessSection accessPoint={accessPoint} />
          </AccessPointSection>

          <AccessPointSection icon="🅿️" iconUrl={DETAIL_ICONS.parking} title="Parking">
            <ParkingSection accessPoint={accessPoint} />
          </AccessPointSection>

          <AccessPointSection
            icon="🏕️"
            iconUrl={DETAIL_ICONS.facilities}
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
            stateSegment={stateSegment}
          />
        )}

        {/* Fallback back-link (breadcrumbs above are the primary path) */}
        <div className="pt-2">
          <Link
            href={riverHref}
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {accessPoint.river.name}
          </Link>
        </div>
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
