'use client';

// src/components/river/RiverCardGrid.tsx
// Client-side filterable grid of river cards for the rivers index page

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, ArrowRight } from 'lucide-react';
import RiverFilters, { type FilterType } from './RiverFilters';

interface RiverCardData {
  id: string;
  slug: string;
  name: string;
  conditionCode: string | undefined;
  conditionColor: string;
  conditionLabel: string;
  description: string | null;
  imageUrl: string | undefined;
  lengthMiles: number;
  accessPointCount: number;
  region: string | null;
  difficultyRating: string | null;
}

interface RiverCardGridProps {
  rivers: RiverCardData[];
}

// Region-based river groupings
const OZARK_NSR_SLUGS = ['current', 'jacks-fork', 'eleven-point'];
const STL_AREA_SLUGS = ['meramec', 'huzzah', 'courtois'];

export default function RiverCardGrid({ rivers }: RiverCardGridProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredRivers = useMemo(() => {
    if (filter === 'all') return rivers;
    if (filter === 'flowing') return rivers.filter(r => r.conditionCode === 'flowing');
    if (filter === 'good') return rivers.filter(r => r.conditionCode === 'good' || r.conditionCode === 'flowing');
    if (filter === 'ozark_nsr') return rivers.filter(r => OZARK_NSR_SLUGS.includes(r.slug));
    if (filter === 'stl_area') return rivers.filter(r => STL_AREA_SLUGS.includes(r.slug));
    return rivers;
  }, [rivers, filter]);

  return (
    <>
      <RiverFilters onFilterChange={setFilter} />

      {filteredRivers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 text-sm">No rivers match this filter right now. Try a different one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRivers.map((river) => (
            <Link
              key={river.id}
              href={`/plan?river=${river.slug}`}
              className="group bg-white border border-neutral-200 rounded-xl overflow-hidden transition-all hover:shadow-md hover:border-primary-300 no-underline"
            >
              <div className="relative h-36 overflow-hidden">
                {river.imageUrl ? (
                  <Image
                    src={river.imageUrl}
                    alt={river.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-200" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
              <div className="px-4 pt-4 pb-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <Droplets className="w-4 h-4 text-primary-500 flex-shrink-0" />
                      <h2 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                        {river.name}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white"
                        style={{ backgroundColor: river.conditionColor }}
                      >
                        {river.conditionLabel}
                      </span>
                      {river.region && (
                        <span className="text-xs text-neutral-500">{river.region}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                </div>
              </div>

              {river.description && (
                <div className="px-4 pb-3 sm:px-5">
                  <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">
                    {river.description}
                  </p>
                </div>
              )}

              <div className="px-4 pb-4 sm:px-5">
                <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2.5 border-t border-neutral-100">
                  <span className="flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5" />
                    {river.lengthMiles} miles
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {river.accessPointCount} access points
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
