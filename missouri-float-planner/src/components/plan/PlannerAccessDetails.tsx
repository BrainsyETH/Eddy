'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AccessPoint } from '@/types/api';
import { useAccessPointDetail } from '@/hooks/useAccessPointDetail';
import AccessPointPhoto from '@/components/access-point/AccessPointPhoto';
import AccessPointGauge from '@/components/access-point/AccessPointGauge';
import AccessPointNav from '@/components/access-point/AccessPointNav';
import RoadAccessSection from '@/components/access-point/sections/RoadAccessSection';
import ParkingSection from '@/components/access-point/sections/ParkingSection';
import FacilitiesSection from '@/components/access-point/sections/FacilitiesSection';
import OutfittersSection from '@/components/access-point/sections/OutfittersSection';
import RiverNotesSection from '@/components/access-point/sections/RiverNotesSection';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';

/** Preview and expanded endpoints share the actual access-page sections. */
export default function PlannerAccessDetails({ point, riverSlug }: { point: AccessPoint; riverSlug: string }) {
  const query = useAccessPointDetail(riverSlug, point.slug, point.id);
  const detail = query.data?.accessPoint;
  const current = detail ?? point;
  const photos = [...new Set([...current.imageUrls, ...(current.npsCampground?.images.map(photo => photo.url) ?? [])])];
  const [photoIndex, setPhotoIndex] = useState(0);
  const index = photoIndex % Math.max(1, photos.length);
  return <div className="space-y-4 text-sm text-neutral-700">
    {photos.length > 0 && <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-neutral-100">
      <AccessPointPhoto src={photos[index]} alt={`${point.name}, photo ${index + 1}`} className="absolute inset-0 h-full w-full object-cover" />
      {photos.length > 1 && <>
        <button type="button" aria-label="Previous photo" onClick={() => setPhotoIndex((index - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Next photo" onClick={() => setPhotoIndex(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"><ChevronRight size={18} /></button>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white">{index + 1} / {photos.length}</span>
      </>}
    </div>}
    {query.data?.gaugeStatus && <AccessPointGauge gaugeStatus={query.data.gaugeStatus} />}
    <details className="rounded-xl border border-neutral-200 bg-white p-3">
      <summary className="cursor-pointer font-semibold text-primary-700">Directions</summary>
      <div className="mt-3"><AccessPointNav accessPoint={current} /></div>
    </details>
    {current.description && <p className="leading-relaxed">{current.description}</p>}
    {query.isPending && <p role="status" className="text-xs text-neutral-500">Loading more about this place…</p>}
    {query.isError && <p role="status" className="text-xs text-neutral-600">More details couldn’t load. <button type="button" className="font-semibold text-primary-700 underline" onClick={() => void query.refetch()}>Try again</button></p>}
    {detail ? <>
      {(detail.roadSurface.length > 0 || detail.roadAccess) && <PlaceSection title="Getting in" icon="road"><RoadAccessSection accessPoint={detail} /></PlaceSection>}
      {(detail.parkingCapacity || detail.parkingInfo) && <PlaceSection title="Parking" icon="parking"><ParkingSection accessPoint={detail} /></PlaceSection>}
      {(detail.facilities || detail.managingAgency || detail.officialSiteUrl || detail.feeRequired || detail.npsCampground || detail.availability || detail.booking) &&
        <PlaceSection title={detail.npsCampground || detail.availability || detail.booking ? 'Facilities & camping' : 'Facilities'} icon="facilities"><FacilitiesSection accessPoint={detail} /></PlaceSection>}
      {detail.nearbyServices.length > 0 && <PlaceSection title="Nearby services" icon="outfitter"><OutfittersSection services={detail.nearbyServices} /></PlaceSection>}
      {detail.localTips && <RiverNotesSection tips={detail.localTips} />}
    </> : <>
      {point.roadAccess && <PlaceSection title="Getting in" icon="road"><p>{point.roadAccess}</p></PlaceSection>}
      {point.parkingInfo && <PlaceSection title="Parking" icon="parking"><p>{point.parkingInfo}</p></PlaceSection>}
      {point.facilities && <PlaceSection title="Facilities" icon="facilities"><p>{point.facilities}</p></PlaceSection>}
    </>}
    <Link href={detail?.path ?? `/rivers/${riverSlug}/access/${point.slug}`} className="inline-block text-xs font-semibold text-primary-700 hover:underline">Full access details →</Link>
  </div>;
}

function PlaceSection({ title, icon, children }: { title: string; icon: EddyIconName; children: ReactNode }) {
  return <section className="border-t border-neutral-200/70 pt-3">
    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-neutral-900"><EddyIcon name={icon} size={25} />{title}</h3>
    {children}
  </section>;
}
