// src/components/access-point/sections/ParkingSection.tsx
// Parking details section

import type { AccessPointDetail } from '@/types/api';
import { formatParkingCapacity } from '@/lib/navigation';
import { FactRow, ProseBlock } from './DetailText';

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
        <FactRow label="Capacity" value={formatParkingCapacity(accessPoint.parkingCapacity)} />
      )}

      {hasInfo && <ProseBlock text={accessPoint.parkingInfo!} />}
    </div>
  );
}
