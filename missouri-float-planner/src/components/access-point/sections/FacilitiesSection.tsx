// src/components/access-point/sections/FacilitiesSection.tsx
// Facilities details section with agency link

import { ExternalLink } from 'lucide-react';
import type { AccessPointDetail } from '@/types/api';
import { getAgencyFullName } from '@/lib/navigation';

interface FacilitiesSectionProps {
  accessPoint: AccessPointDetail;
}

export default function FacilitiesSection({ accessPoint }: FacilitiesSectionProps) {
  const hasAgency = !!accessPoint.managingAgency;
  const hasUrl = !!accessPoint.officialSiteUrl;
  const hasFacilities = !!accessPoint.facilities;
  const hasFee = accessPoint.feeRequired;

  if (!hasAgency && !hasFacilities && !hasFee) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No facilities information available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Facilities text */}
      {hasFacilities && (
        <InfoRow label="Amenities" value={accessPoint.facilities!} />
      )}

      {/* Fee info */}
      {accessPoint.feeRequired && (
        <InfoRow
          label="Fee"
          value={accessPoint.feeNotes || 'Fee required'}
        />
      )}
      {!accessPoint.feeRequired && hasFacilities && (
        <InfoRow label="Fee" value="No fee" />
      )}

      {/* Managing agency */}
      {hasAgency && (
        <InfoRow
          label="Managed by"
          value={getAgencyFullName(accessPoint.managingAgency)}
        />
      )}

      {/* Official site link */}
      {hasUrl && (
        <a
          href={accessPoint.officialSiteUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 mt-2 p-2.5 -mx-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors group"
        >
          <span className="text-sm text-primary-700 font-medium group-hover:text-primary-800">
            View official {accessPoint.managingAgency || 'site'} page
          </span>
          <ExternalLink className="w-4 h-4 text-primary-600" />
        </a>
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
