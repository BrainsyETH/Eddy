// src/components/access-point/AccessPointHeader.tsx
// Hero header with quick stats and gauge status for access point detail

import type { AccessPointDetail, AccessPointGaugeStatus } from '@/types/api';
import AccessPointGauge from './AccessPointGauge';
import { formatParkingCapacity, getRoadSurfaceBadge } from '@/lib/navigation';

interface AccessPointHeaderProps {
  accessPoint: AccessPointDetail;
  gaugeStatus: AccessPointGaugeStatus | null;
}

export default function AccessPointHeader({ accessPoint, gaugeStatus }: AccessPointHeaderProps) {
  // Determine use type label
  const useTypes = accessPoint.types || [];
  let useLabel = 'Access';
  if (useTypes.includes('put_in') && useTypes.includes('take_out')) {
    useLabel = 'Put-in / Take-out';
  } else if (useTypes.includes('put_in')) {
    useLabel = 'Put-in';
  } else if (useTypes.includes('take_out')) {
    useLabel = 'Take-out';
  } else if (useTypes.includes('campground')) {
    useLabel = 'Campground';
  } else if (useTypes.includes('boat_ramp')) {
    useLabel = 'Boat Ramp';
  }

  // Parking label
  const parkingLabel = accessPoint.parkingCapacity
    ? formatParkingCapacity(accessPoint.parkingCapacity)
    : accessPoint.parkingInfo
      ? 'Available'
      : 'Unknown';

  // Road label
  const roadLabel = accessPoint.roadSurface.length > 0
    ? getRoadSurfaceBadge(accessPoint.roadSurface) || 'Unknown'
    : accessPoint.roadAccess
      ? extractRoadType(accessPoint.roadAccess)
      : 'Unknown';

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      {/* Hero Section */}
      <div
        className="relative h-36 bg-gradient-to-br from-primary-700 via-primary-600 to-support-500 flex items-end p-4"
      >
        {/* Decorative river lines */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          preserveAspectRatio="none"
        >
          <path
            d="M0,60 Q80,20 160,50 T320,40 T480,55 T640,35"
            stroke="white"
            fill="none"
            strokeWidth="2"
          />
          <path
            d="M0,90 Q100,60 200,85 T400,70 T600,80"
            stroke="white"
            fill="none"
            strokeWidth="1.5"
          />
        </svg>

        {/* Hero Image (if available) */}
        {accessPoint.imageUrls && accessPoint.imageUrls.length > 0 && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${accessPoint.imageUrls[0]})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
        )}

        <div className="relative z-10">
          <h1 className="text-xl font-bold text-white drop-shadow-md">
            {accessPoint.name}
          </h1>
          <p className="text-sm text-white/80 mt-1">
            River mile {accessPoint.riverMile.toFixed(1)} · {accessPoint.river.name}
          </p>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-3 divide-x divide-neutral-200 border-b border-neutral-200">
        <QuickStat label="Use as" value={useLabel} />
        <QuickStat label="Parking" value={parkingLabel} />
        <QuickStat label="Road" value={roadLabel} />
      </div>

      {/* Gauge Status */}
      <div className="p-4">
        <AccessPointGauge gaugeStatus={gaugeStatus} />
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-xs font-semibold text-neutral-900 leading-tight">
        {value}
      </div>
    </div>
  );
}

// Helper to extract road type from free text
function extractRoadType(roadAccess: string): string {
  const lower = roadAccess.toLowerCase();
  if (lower.includes('paved') || lower.includes('asphalt')) return 'Paved';
  if (lower.includes('gravel')) return 'Gravel';
  if (lower.includes('dirt')) return 'Dirt';
  if (lower.includes('4wd') || lower.includes('4x4')) return '4WD';
  if (lower.includes('seasonal')) return 'Seasonal';
  return 'Unknown';
}
