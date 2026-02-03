// src/components/access-point/sections/OutfittersSection.tsx
// Nearby outfitters and campgrounds section

import { Phone, Globe, MapPin } from 'lucide-react';
import type { NearbyService } from '@/types/api';

interface OutfittersSectionProps {
  services: NearbyService[];
}

export default function OutfittersSection({ services }: OutfittersSectionProps) {
  if (!services || services.length === 0) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No outfitters or campgrounds listed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {services.map((service, index) => (
        <ServiceCard key={index} service={service} />
      ))}
    </div>
  );
}

function ServiceCard({ service }: { service: NearbyService }) {
  const typeLabels: Record<string, string> = {
    outfitter: 'Outfitter',
    campground: 'Campground',
    canoe_rental: 'Canoe Rental',
    shuttle: 'Shuttle Service',
    lodging: 'Lodging',
  };

  return (
    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">
            {service.name}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-neutral-500">
              {typeLabels[service.type] || service.type}
            </span>
            {service.distance && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-xs text-neutral-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {service.distance}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Phone link */}
        {service.phone && (
          <a
            href={`tel:${service.phone.replace(/[^\d+]/g, '')}`}
            className="text-xs font-mono text-primary-700 hover:text-primary-800 flex items-center gap-1"
          >
            <Phone className="w-3 h-3" />
            {service.phone}
          </a>
        )}
      </div>

      {/* Website and notes */}
      <div className="mt-2 space-y-1">
        {service.website && (
          <a
            href={service.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            Visit website
          </a>
        )}

        {service.notes && (
          <p className="text-xs text-neutral-600 italic">
            {service.notes}
          </p>
        )}
      </div>
    </div>
  );
}
