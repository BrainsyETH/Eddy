'use client';

// src/components/river/NearbyServices.tsx
// Grouped directory of outfitters, campgrounds, and lodging for a river

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Phone, Globe, Mail, ShieldCheck, ExternalLink, Tent, ChevronLeft, ChevronRight } from 'lucide-react';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useNearbyServices } from '@/hooks/useNearbyServices';
import { EDDY_IMAGES } from '@/constants';
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

// ─── Outfitter Card (detailed) ───────────────────────────────────

function OutfitterCard({ service }: { service: NearbyServiceDirectory }) {
  const hasAuth = service.npsAuthorized || service.usfsAuthorized;

  return (
    <div className="bg-neutral-50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-900">{service.name}</p>
          {service.city && (
            <p className="text-xs text-neutral-500 mt-0.5">{service.city}, {service.state}</p>
          )}
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

      {service.description && (
        <p className="text-sm text-neutral-600 mt-1.5 line-clamp-2">{service.description}</p>
      )}

      {service.servicesOffered && service.servicesOffered.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {service.servicesOffered.map((offering) => (
            <span key={offering} className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600 text-[11px] font-medium">
              {OFFERING_LABELS[offering] || offering}
            </span>
          ))}
        </div>
      )}

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

      {service.seasonalNotes && (
        <p className="text-xs text-neutral-500 italic mt-2">{service.seasonalNotes}</p>
      )}
    </div>
  );
}

// ─── Campground Card (compact, grid-friendly) ────────────────────

function CampgroundCard({ service }: { service: NearbyServiceDirectory }) {
  const hasAuth = service.npsAuthorized || service.usfsAuthorized;
  const totalSites = (service.tentSites ?? 0) + (service.rvSites ?? 0);

  return (
    <div className="bg-neutral-50 rounded-lg overflow-hidden">
      {/* Image area */}
      <div className="h-28 bg-neutral-100 flex items-center justify-center relative">
        <Image
          src={EDDY_IMAGES.canoe}
          alt=""
          width={48}
          height={48}
          className="w-12 h-12 object-contain opacity-40"
        />
      </div>

      <div className="p-3">
        <p className="font-semibold text-neutral-900 text-sm">{service.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {hasAuth && (
            <span className="text-[10px] text-green-700 font-medium">
              {service.npsAuthorized ? 'NPS' : 'USFS'}
            </span>
          )}
          {hasAuth && service.city && <span className="text-neutral-300 text-[10px]">·</span>}
          {service.city && (
            <span className="text-[10px] text-neutral-500">{service.city}</span>
          )}
        </div>

        {/* Site info */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-neutral-600">
          {totalSites > 0 && (
            <>
              <Tent className="w-3 h-3 text-neutral-400" />
              <span>{totalSites} sites</span>
            </>
          )}
          {service.feeRange && (
            <>
              {totalSites > 0 && <span className="text-neutral-300">·</span>}
              <span>{service.feeRange}</span>
            </>
          )}
        </div>

        {service.seasonalNotes && (
          <p className="text-[10px] text-neutral-500 italic mt-1.5 line-clamp-1">{service.seasonalNotes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2.5">
          {service.reservationUrl && (
            <a
              href={service.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              Reserve
            </a>
          )}
          {service.phone && (
            <a href={`tel:${service.phone}`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
              <Phone className="w-3 h-3" />
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cabin/Lodge Card (compact, scroll-friendly) ─────────────────

function CabinCard({ service }: { service: NearbyServiceDirectory }) {
  return (
    <div className="w-44 flex-shrink-0 bg-neutral-50 rounded-lg overflow-hidden">
      <div className="h-24 bg-neutral-100 flex items-center justify-center">
        <Image
          src={EDDY_IMAGES.canoe}
          alt=""
          width={40}
          height={40}
          className="w-10 h-10 object-contain opacity-40"
        />
      </div>
      <div className="p-2.5">
        <p className="font-semibold text-neutral-900 text-sm line-clamp-1">{service.name}</p>
        <p className="text-[10px] text-neutral-500 mt-0.5 line-clamp-1">
          {TYPE_LABELS[service.type]}{service.city ? ` · ${service.city}` : ''}
        </p>
        {service.feeRange && (
          <p className="text-xs font-semibold text-accent-600 mt-1.5">{service.feeRange}</p>
        )}
        {service.website && (
          <a
            href={service.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary-600 hover:text-primary-700 font-medium mt-1"
          >
            <Globe className="w-2.5 h-2.5" />
            Website
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Horizontal scroll container with arrows ─────────────────────

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 200;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
      {/* Scroll arrows */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-7 h-7 rounded-full bg-white border border-neutral-200 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4 text-neutral-600" />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-7 h-7 rounded-full bg-white border border-neutral-200 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronRight className="w-4 h-4 text-neutral-600" />
      </button>
      {/* Right fade hint */}
      <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
    </div>
  );
}

// ─── Subsection header ───────────────────────────────────────────

function SubsectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-bold text-neutral-900">{title}</h4>
      {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────

type FilterValue = 'all' | NearbyServiceDirectoryType;

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'outfitter', label: 'Outfitters' },
  { value: 'campground', label: 'Campgrounds' },
  { value: 'cabin_lodge', label: 'Cabins & Lodges' },
];

export default function NearbyServices({ riverSlug, defaultOpen = false }: NearbyServicesProps) {
  const { data: services, isLoading } = useNearbyServices(riverSlug);
  const [filter, setFilter] = useState<FilterValue>('all');

  const serviceList = services || [];

  const sortByDisplayOrder = (list: NearbyServiceDirectory[]) =>
    [...list].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

  const outfitters = sortByDisplayOrder(serviceList.filter(s => s.type === 'outfitter'));
  const campgrounds = sortByDisplayOrder(serviceList.filter(s => s.type === 'campground'));
  const cabins = sortByDisplayOrder(serviceList.filter(s => s.type === 'cabin_lodge'));

  const counts: Record<FilterValue, number> = {
    all: serviceList.length,
    outfitter: outfitters.length,
    campground: campgrounds.length,
    cabin_lodge: cabins.length,
  };

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

  const showOutfitters = filter === 'all' || filter === 'outfitter';
  const showCampgrounds = filter === 'all' || filter === 'campground';
  const showCabins = filter === 'all' || filter === 'cabin_lodge';

  return (
    <CollapsibleSection title="Outfitters & Services" defaultOpen={defaultOpen} badge={badge}>
      {serviceList.length > 0 ? (
        <div>
          {/* Category filter tabs */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {FILTER_OPTIONS.map((opt) => {
              const count = counts[opt.value];
              if (opt.value !== 'all' && count === 0) return null;
              const isActive = filter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {opt.label}
                  <span className={`ml-1 ${isActive ? 'text-white/70' : 'text-neutral-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Outfitters subsection */}
          {showOutfitters && outfitters.length > 0 && (
            <div className="mb-6">
              <SubsectionHeader
                title="Outfitters"
                subtitle="Canoe, kayak, raft rentals with shuttle service"
              />
              <div className="space-y-3">
                {outfitters.map(s => <OutfitterCard key={s.id} service={s} />)}
              </div>
            </div>
          )}

          {/* Campgrounds subsection */}
          {showCampgrounds && campgrounds.length > 0 && (
            <div className="mb-6">
              <SubsectionHeader
                title="Campgrounds"
                subtitle="Riverside and nearby camping"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campgrounds.map(s => <CampgroundCard key={s.id} service={s} />)}
              </div>
            </div>
          )}

          {/* Cabins & Lodges subsection */}
          {showCabins && cabins.length > 0 && (
            <div>
              <SubsectionHeader
                title="Cabins & Lodges"
                subtitle="Nearby overnight stays"
              />
              <HorizontalScroll>
                {cabins.map(s => <CabinCard key={s.id} service={s} />)}
              </HorizontalScroll>
            </div>
          )}
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
