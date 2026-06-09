// src/components/access-point/sections/ParkingSection.tsx
// Parking details section

import type { AccessPointDetail } from '@/types/api';
import { formatParkingCapacity } from '@/lib/navigation';

interface ParkingSectionProps {
  accessPoint: AccessPointDetail;
}

export default function ParkingSection({ accessPoint }: ParkingSectionProps) {
  const hasCapacity = !!accessPoint.parkingCapacity;
  const hasInfo = !!accessPoint.parkingInfo;

  if (!hasCapacity && !hasInfo) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No parking information available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hasCapacity && (
        <InfoRow
          label="Capacity"
          value={formatParkingCapacity(accessPoint.parkingCapacity)}
        />
      )}

      {hasInfo && (
        <InfoRow label="Details" value={accessPoint.parkingInfo!} />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-neutral-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-neutral-900 font-medium text-right">
        {value}
      </span>
    </div>
  );
}
