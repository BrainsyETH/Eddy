// src/components/access-point/sections/FacilitiesSection.tsx
// Facilities details section with NPS campground data integration

import { ExternalLink, Tent, Droplets, Phone, Flame, Trash2 } from 'lucide-react';
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
  const nps = accessPoint.npsCampground;

  if (!hasAgency && !hasFacilities && !hasFee && !nps) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No facilities information available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* NPS Campground Data */}
      {nps && (
        <div className="space-y-3">
          {/* Fee Table */}
          {nps.fees.length > 0 && (
            <div>
              <SectionLabel>Camping Fees</SectionLabel>
              <div className="space-y-1.5">
                {nps.fees.map((fee, i) => (
                  <div key={i} className="flex justify-between items-start gap-3">
                    <span className="text-sm text-neutral-600">{fee.title}</span>
                    <span className="text-sm text-neutral-900 font-semibold whitespace-nowrap">
                      ${parseFloat(fee.cost).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reservation Info */}
          {nps.reservationUrl && (
            <a
              href={nps.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 p-2.5 -mx-2 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors group"
            >
              <span className="text-sm text-primary-700 font-medium group-hover:text-primary-800">
                Make a reservation on Recreation.gov
              </span>
              <ExternalLink className="w-4 h-4 text-primary-600 flex-shrink-0" />
            </a>
          )}
          {nps.reservationInfo && !nps.reservationUrl && (
            <InfoRow label="Reservations" value={nps.reservationInfo} />
          )}

          {/* Site Counts */}
          {nps.totalSites > 0 && (
            <div>
              <SectionLabel>Campsites</SectionLabel>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <SiteStat label="Total" value={nps.totalSites} />
                {nps.sitesFirstCome > 0 && (
                  <SiteStat label="First-come" value={nps.sitesFirstCome} />
                )}
                {nps.sitesReservable > 0 && (
                  <SiteStat label="Reservable" value={nps.sitesReservable} />
                )}
                {nps.sitesGroup > 0 && (
                  <SiteStat label="Group" value={nps.sitesGroup} />
                )}
                {nps.sitesTentOnly > 0 && (
                  <SiteStat label="Tent only" value={nps.sitesTentOnly} />
                )}
                {nps.sitesWalkBoatTo > 0 && (
                  <SiteStat label="Walk/boat-in" value={nps.sitesWalkBoatTo} />
                )}
                {nps.sitesElectrical > 0 && (
                  <SiteStat label="Electric" value={nps.sitesElectrical} />
                )}
                {nps.sitesRvOnly > 0 && (
                  <SiteStat label="RV only" value={nps.sitesRvOnly} />
                )}
              </div>
            </div>
          )}

          {/* Key Amenities */}
          <div>
            <SectionLabel>Amenities</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {nps.amenities.toilets.length > 0 && (
                <AmenityChip
                  icon={<Tent className="w-3.5 h-3.5" />}
                  label={formatToilets(nps.amenities.toilets)}
                />
              )}
              {nps.amenities.potableWater.length > 0 &&
                !nps.amenities.potableWater.every(w => w === 'No water') && (
                <AmenityChip
                  icon={<Droplets className="w-3.5 h-3.5" />}
                  label="Water"
                />
              )}
              {nps.amenities.cellPhoneReception &&
                nps.amenities.cellPhoneReception !== 'No' &&
                nps.amenities.cellPhoneReception !== 'Unknown' && (
                <AmenityChip
                  icon={<Phone className="w-3.5 h-3.5" />}
                  label={`Cell: ${nps.amenities.cellPhoneReception}`}
                />
              )}
              {nps.amenities.firewoodForSale === 'Yes' && (
                <AmenityChip
                  icon={<Flame className="w-3.5 h-3.5" />}
                  label="Firewood"
                />
              )}
              {nps.amenities.trashCollection &&
                nps.amenities.trashCollection !== 'No' &&
                nps.amenities.trashCollection !== 'Unknown' && (
                <AmenityChip
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  label="Trash"
                />
              )}
              {nps.amenities.showers.length > 0 &&
                !nps.amenities.showers.every(s => s === 'None') && (
                <AmenityChip label="Showers" />
              )}
              {nps.amenities.campStore === 'Yes' && (
                <AmenityChip label="Camp store" />
              )}
              {nps.amenities.dumpStation === 'Yes' && (
                <AmenityChip label="Dump station" />
              )}
            </div>
          </div>

          {/* Operating Season */}
          {nps.operatingHours.length > 0 && nps.operatingHours[0].description && (
            <InfoRow label="Season" value={nps.operatingHours[0].description} />
          )}

          {/* Classification */}
          {nps.classification && (
            <InfoRow label="Type" value={nps.classification} />
          )}

          {/* NPS page link */}
          {nps.npsUrl && (
            <a
              href={nps.npsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 p-2.5 -mx-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors group"
            >
              <span className="text-sm text-primary-700 font-medium group-hover:text-primary-800">
                View on NPS.gov
              </span>
              <ExternalLink className="w-4 h-4 text-primary-600 flex-shrink-0" />
            </a>
          )}

          {/* Divider before existing facilities data */}
          {(hasFacilities || hasAgency || hasFee) && (
            <div className="border-t border-neutral-200 pt-3" />
          )}
        </div>
      )}

      {/* Existing facilities text */}
      {hasFacilities && (
        <InfoRow label="Amenities" value={accessPoint.facilities!} />
      )}

      {/* Fee info (only show if no NPS data, since NPS has its own fees) */}
      {!nps && accessPoint.feeRequired && (
        <InfoRow
          label="Fee"
          value={accessPoint.feeNotes || 'Fee required'}
        />
      )}
      {!nps && !accessPoint.feeRequired && hasFacilities && (
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
      {children}
    </p>
  );
}

function SiteStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-sm text-neutral-900 font-semibold">{value}</span>
    </div>
  );
}

function AmenityChip({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 text-neutral-700 rounded-md text-xs font-medium">
      {icon}
      {label}
    </span>
  );
}

function formatToilets(toilets: string[]): string {
  if (toilets.some(t => t.toLowerCase().includes('flush'))) return 'Flush toilets';
  if (toilets.some(t => t.toLowerCase().includes('vault'))) return 'Vault toilets';
  if (toilets.some(t => t.toLowerCase().includes('pit'))) return 'Pit toilets';
  return 'Restrooms';
}
