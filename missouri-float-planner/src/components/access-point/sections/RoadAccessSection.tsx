// src/components/access-point/sections/RoadAccessSection.tsx
// Road access details section

import type { AccessPointDetail } from '@/types/api';
import { formatRoadSurface } from '@/lib/navigation';

interface RoadAccessSectionProps {
  accessPoint: AccessPointDetail;
}

export default function RoadAccessSection({ accessPoint }: RoadAccessSectionProps) {
  const hasRoadSurface = accessPoint.roadSurface && accessPoint.roadSurface.length > 0;

  return (
    <div className="space-y-3">
      {/* Road surface types */}
      {hasRoadSurface && (
        <InfoRow
          label="Road type"
          value={formatRoadSurface(accessPoint.roadSurface)}
        />
      )}

      {/* Free text road access notes */}
      {accessPoint.roadAccess && (
        <InfoRow label="Details" value={accessPoint.roadAccess} />
      )}

      {/* Coordinates */}
      {accessPoint.drivingLat && accessPoint.drivingLng && (
        <InfoRow
          label="Coordinates"
          value={`${accessPoint.drivingLat.toFixed(4)}°N, ${Math.abs(accessPoint.drivingLng).toFixed(4)}°W`}
          subtle
        />
      )}

      {/* If no road info at all */}
      {!hasRoadSurface && !accessPoint.roadAccess && (
        <p className="text-sm text-neutral-500 italic">
          No road access information available.
        </p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  subtle = false,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-neutral-500 flex-shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${
          subtle ? 'text-neutral-400' : 'text-neutral-900 font-medium'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
