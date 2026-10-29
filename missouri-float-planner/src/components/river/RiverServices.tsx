'use client';

// src/components/river/RiverServices.tsx
// The river page's Campgrounds and Outfitters — compact lists, as in the app.
//
// The full directory (NearbyServices) ran to 43 expanded cards on the Current,
// with empty photo boxes and a horizontal scroller nested inside. The app's
// river screen answers the same two questions — "where can I camp", "who rents
// boats and runs shuttles" — as two short lists, and this is that.
//
// Membership is the shared serviceTiers rule, as everywhere else: a business
// that both camps and rents appears under both headings ON PURPOSE (see the
// note in eddy-ios river/[slug].tsx and src/lib/service-tiers.ts). Lodging-only
// places join Campgrounds, since the question they answer is where to stay.

import { useState } from 'react';
import { Phone, Globe, ExternalLink } from 'lucide-react';
import AvailabilityChip from '@/components/ui/AvailabilityChip';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { useNearbyServices } from '@/hooks/useNearbyServices';
import { OFFERING_LABELS } from '@/lib/services/offerings';
import { serviceEligible, serviceTiers } from '@/lib/service-tiers';
import type { NearbyServiceDirectory } from '@/types/api';
import { formatPhone } from './NearbyServices';

const INITIAL_ROWS = 4;

function websiteHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Website'; }
}

function ServiceRow({ service, camping }: { service: NearbyServiceDirectory; camping: boolean }) {
  const authority = service.npsAuthorized ? 'NPS' : service.usfsAuthorized ? 'USFS' : null;
  const offerings = (service.servicesOffered ?? [])
    .map((o) => OFFERING_LABELS[o])
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ');
  return (
    <li className="border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{service.name}</p>
          <p className="text-xs text-neutral-500">
            {[service.city, authority].filter(Boolean).join(' · ')}
          </p>
          {camping && service.availability ? (
            <div className="mt-1.5"><AvailabilityChip availability={service.availability} name={service.name} /></div>
          ) : !camping && offerings ? (
            <p className="mt-1 text-xs text-neutral-600">{offerings}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          {camping && service.reservationUrl && (
            <a
              href={service.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Reserve at ${service.name}`}
              className="btn-outline btn--sm inline-flex items-center gap-1.5"
            >
              Reserve <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          {service.phone && (
            <a href={`tel:${service.phone}`} className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />{formatPhone(service.phone)}
            </a>
          )}
          {service.website && (
            <a href={service.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800">
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />{websiteHost(service.website)}
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function ServiceList({ id, title, icon, services, camping, className }: {
  id: string;
  title: string;
  icon: EddyIconName;
  services: NearbyServiceDirectory[];
  camping: boolean;
  className: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (services.length === 0) return null;
  const shown = showAll ? services : services.slice(0, INITIAL_ROWS);
  return (
    <section id={id} className={className} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-neutral-900 md:text-2xl">
        <EddyIcon name={icon} size={28} />
        {title}
        <span className="font-sans text-sm font-medium text-neutral-500">{services.length}</span>
      </h2>
      <div className="card-panel">
        <ul className="m-0 list-none p-0">
          {shown.map((service) => <ServiceRow key={service.id} service={service} camping={camping} />)}
        </ul>
        {services.length > INITIAL_ROWS && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="w-full border-t border-neutral-200 px-4 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            {showAll ? 'Show fewer' : `Show all ${services.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

export default function RiverServices({ riverSlug, sectionClassName }: { riverSlug: string; sectionClassName: string }) {
  const { data: services } = useNearbyServices(riverSlug);
  const eligible = [...(services ?? [])]
    .filter(serviceEligible)
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

  const campgrounds = eligible.filter((s) => {
    const tiers = serviceTiers(s);
    return tiers.includes('camping') || (tiers.includes('lodging') && !tiers.includes('rentals'));
  });
  const outfitters = eligible.filter((s) => serviceTiers(s).includes('rentals'));

  return (
    <>
      <ServiceList id="campgrounds" title="Campgrounds" icon="campground" services={campgrounds} camping className={sectionClassName} />
      <ServiceList id="outfitters" title="Outfitters" icon="outfitter" services={outfitters} camping={false} className={sectionClassName} />
    </>
  );
}
