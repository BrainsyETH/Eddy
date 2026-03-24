'use client';

// src/components/river/NearbyServices.tsx
// Directory of outfitters, campgrounds, and lodging for a river

import { Phone, Globe, Mail, ShieldCheck, ExternalLink } from 'lucide-react';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useNearbyServices } from '@/hooks/useNearbyServices';
import type { NearbyServiceDirectory, ServiceOffering, NearbyServiceDirectoryType } from '@/types/api';

interface NearbyServicesProps {
  riverSlug: string;
  defaultOpen?: boolean;
}

const TYPE_LABELS: Record<NearbyServiceDirectoryType, string> = {
  outfitter: 'Outfitter',
  campground: 'Campground',
  cabin_lodge: 'Cabin & Lodge',
};

const TYPE_COLORS: Record<NearbyServiceDirectoryType, string> = {
  outfitter: 'bg-blue-100 text-blue-700',
  campground: 'bg-green-100 text-green-700',
  cabin_lodge: 'bg-amber-100 text-amber-700',
};

const OFFERING_LABELS: Record<ServiceOffering, string> = {
  canoe_rental: 'Canoes',
  kayak_rental: 'Kayaks',
  raft_rental: 'Rafts',
  tube_rental: 'Tubes',
  jon_boat_rental: 'Jon Boats',
  shuttle: 'Shuttle',
  camping_primitive: 'Tent Camping',
  camping_rv: 'RV Sites',
  cabins: 'Cabins',
  lodge_rooms: 'Lodge Rooms',
  general_store: 'General Store',
  food_service: 'Food',
  showers: 'Showers',
  fishing_supplies: 'Fishing',
  horseback_riding: 'Horseback',
  swimming_pool: 'Pool',
  wifi: 'Wi-Fi',
  potable_water: 'Water',
  fire_rings: 'Fire Rings',
  picnic_tables: 'Picnic Tables',
  boat_ramp: 'Boat Ramp',
  dump_station: 'Dump Station',
  flush_toilets: 'Flush Toilets',
  vault_toilets: 'Vault Toilets',
  laundry: 'Laundry',
  playground: 'Playground',
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function ServiceCard({ service }: { service: NearbyServiceDirectory & { isPrimary?: boolean; sectionDescription?: string | null } }) {
  const hasAuth = service.npsAuthorized || service.usfsAuthorized;

  return (
    <div className="bg-neutral-50 rounded-lg p-4">
      {/* Header: name, type badge, auth badge */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-900">{service.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[service.type]}`}>
              {TYPE_LABELS[service.type]}
            </span>
            {service.sectionDescription && (
              <span className="text-xs text-neutral-500">{service.sectionDescription}</span>
            )}
          </div>
        </div>
        {hasAuth && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            <span className="text-xs text-green-700 font-medium">
              {service.npsAuthorized ? 'NPS' : 'USFS'}
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      {service.description && (
        <p className="text-sm text-neutral-600 mt-1.5 line-clamp-2">{service.description}</p>
      )}

      {/* Location */}
      {service.city && (
        <p className="text-xs text-neutral-500 mt-1.5">
          {service.city}, {service.state}
        </p>
      )}

      {/* Contact row */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        {service.phone && (
          <a href={`tel:${service.phone}`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Phone className="w-3 h-3" />
            {formatPhone(service.phone)}
          </a>
        )}
        {service.website && (
          <a href={service.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Globe className="w-3 h-3" />
            {(() => {
              try { return new URL(service.website).hostname.replace(/^www\./, ''); }
              catch { return 'Website'; }
            })()}
          </a>
        )}
        {service.email && (
          <a href={`mailto:${service.email}`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Mail className="w-3 h-3" />
            Email
          </a>
        )}
      </div>

      {/* Service offerings */}
      {service.servicesOffered && service.servicesOffered.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {service.servicesOffered.map((offering) => (
            <span key={offering} className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600 text-[11px] font-medium">
              {OFFERING_LABELS[offering] || offering}
            </span>
          ))}
        </div>
      )}

      {/* Seasonal notes */}
      {service.seasonalNotes && (
        <p className="text-xs text-neutral-500 italic mt-2">{service.seasonalNotes}</p>
      )}

      {/* Reservation link */}
      {service.reservationUrl && (
        <a
          href={service.reservationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Reserve
        </a>
      )}
    </div>
  );
}

export default function NearbyServices({ riverSlug, defaultOpen = false }: NearbyServicesProps) {
  const { data: services, isLoading } = useNearbyServices(riverSlug);

  const serviceList = services || [];

  const badge = serviceList.length > 0 ? (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 text-neutral-700">
      {serviceList.length}
    </span>
  ) : null;

  if (isLoading) {
    return (
      <CollapsibleSection title="Outfitters & Services" defaultOpen={defaultOpen} badge={badge}>
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-neutral-500">Loading nearby services...</p>
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Outfitters & Services" defaultOpen={defaultOpen} badge={badge}>
      {serviceList.length > 0 ? (
        <div className="space-y-3">
          {serviceList.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      ) : (
        <div className="bg-neutral-50 rounded-lg p-6 text-center">
          <p className="text-sm text-neutral-500">
            No outfitters or services have been added for this river yet.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
