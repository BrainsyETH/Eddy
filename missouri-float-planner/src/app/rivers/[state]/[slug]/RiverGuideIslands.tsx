'use client';

// src/app/rivers/[slug]/RiverGuideIslands.tsx
// Small client islands embedded in the (server-rendered) river guide page —
// the river visuals gallery and nearby services list both fetch their own data.

import RiverVisualGallery from '@/components/river/RiverVisualGallery';
import NearbyServices from '@/components/river/NearbyServices';

interface Props {
  riverSlug: string;
}

export default function RiverGuideIslands({ riverSlug }: Props) {
  return (
    <div className="space-y-4">
      <RiverVisualGallery riverSlug={riverSlug} />
      <NearbyServices riverSlug={riverSlug} defaultOpen={false} />
    </div>
  );
}
