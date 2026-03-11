'use client';

// src/components/river/OutfitterDirectory.tsx
// Outfitter/service directory for river pages
// Uses nearby_services from access points to aggregate services

import { useState } from 'react';
import { Phone, Globe, MapPin, ChevronDown, ChevronUp, Building2, Lightbulb } from 'lucide-react';
import type { AccessPoint } from '@/types/api';

interface OutfitterDirectoryProps {
  riverSlug: string;
  accessPoints: AccessPoint[];
}

interface AggregatedService {
  name: string;
  type: string;
  phone?: string;
  website?: string;
  distance?: string;
  notes?: string;
  nearAccessPoint: string;
}

const typeLabels: Record<string, string> = {
  outfitter: 'Outfitter',
  campground: 'Campground',
  canoe_rental: 'Canoe Rental',
  shuttle: 'Shuttle Service',
  lodging: 'Lodging',
};

const typeOrder = ['outfitter', 'canoe_rental', 'shuttle', 'campground', 'lodging'];

export default function OutfitterDirectory({ riverSlug, accessPoints }: OutfitterDirectoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Aggregate services from all access points, deduplicate by name
  const services: AggregatedService[] = [];
  const seen = new Set<string>();

  for (const ap of accessPoints) {
    if (!ap.nearbyServices) continue;

    for (const service of ap.nearbyServices) {
      const key = service.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      services.push({
        ...service,
        nearAccessPoint: ap.name,
      });
    }
  }

  if (services.length === 0) return null;

  // Sort by type priority, then name
  services.sort((a, b) => {
    const ai = typeOrder.indexOf(a.type);
    const bi = typeOrder.indexOf(b.type);
    const orderA = ai >= 0 ? ai : typeOrder.length;
    const orderB = bi >= 0 ? bi : typeOrder.length;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="bg-white rounded-xl border-2 border-neutral-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary-600" />
          <h3 className="text-base font-bold text-neutral-900">Outfitters & Services</h3>
          <span className="text-xs text-neutral-500">{services.length}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-3">
          {/* Pro tip */}
          <div className="flex items-start gap-2 p-3 bg-accent-50 rounded-lg text-xs text-accent-800">
            <Lightbulb className="w-4 h-4 text-accent-500 shrink-0 mt-0.5" />
            <span>
              <strong>Pro tip:</strong> Rent from the outfitter at your take-out point, so your vehicle is right there waiting when you finish.
            </span>
          </div>

          {services.map((service, index) => (
            <div key={index} className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">{service.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">
                      {typeLabels[service.type] || service.type}
                    </span>
                    <span className="text-xs text-neutral-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Near {service.nearAccessPoint}
                    </span>
                  </div>
                </div>

                {service.phone && (
                  <a
                    href={`tel:${service.phone.replace(/[^\d+]/g, '')}`}
                    className="text-xs font-mono text-primary-700 hover:text-primary-800 flex items-center gap-1 shrink-0"
                  >
                    <Phone className="w-3 h-3" />
                    {service.phone}
                  </a>
                )}
              </div>

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
                  <p className="text-xs text-neutral-600 italic">{service.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
