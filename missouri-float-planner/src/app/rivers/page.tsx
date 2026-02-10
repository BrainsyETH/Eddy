'use client';

// src/app/rivers/page.tsx
// Rivers index page - browse all supported rivers

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, ArrowRight } from 'lucide-react';
import { useRivers } from '@/hooks/useRivers';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';

const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  canoe: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png',
};

// River hero images - scenic photos for each river
const RIVER_IMAGES: Record<string, string> = {
  'meramec': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Meramec_River_Onondaga_Cave_State_Park.jpg/1280px-Meramec_River_Onondaga_Cave_State_Park.jpg',
  'current': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Current_River_-_Missouri.jpg/1280px-Current_River_-_Missouri.jpg',
  'eleven-point': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Eleven_Point_River.jpg/1280px-Eleven_Point_River.jpg',
  'jacks-fork': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Jacks_Fork_River_in_Shannon_County%2C_Missouri.jpg/1280px-Jacks_Fork_River_in_Shannon_County%2C_Missouri.jpg',
  'niangua': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Ha_Ha_Tonka_Spring_20090412.jpg/1280px-Ha_Ha_Tonka_Spring_20090412.jpg',
  'big-piney': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Big_Piney_River.jpg/1280px-Big_Piney_River.jpg',
  'huzzah': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Huzzah_Creek_01.jpg/1280px-Huzzah_Creek_01.jpg',
  'courtois': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Courtois_Creek.jpg/1280px-Courtois_Creek.jpg',
};

// Brief descriptions for each river
const RIVER_DESCRIPTIONS: Record<string, string> = {
  'meramec': 'One of Missouri\'s longest free-flowing rivers, winding through scenic bluffs and popular with paddlers of all levels.',
  'current': 'A National Scenic Riverway fed by massive springs, known for crystal-clear water and excellent floating year-round.',
  'eleven-point': 'A designated National Scenic River offering remote floating through the Mark Twain National Forest.',
  'jacks-fork': 'A spring-fed tributary of the Current River within the Ozark National Scenic Riverways, great for shorter float trips.',
  'niangua': 'A scenic Ozark stream flowing through Camden and Dallas counties, popular for leisurely summer floats.',
  'big-piney': 'A beautiful Ozark river with Class I-II rapids, bluffs, and a remote feel — excellent for intermediate paddlers.',
  'huzzah': 'A smaller, spring-fed stream in the Meramec basin known for quick floats and family-friendly conditions.',
  'courtois': 'A tributary of the Huzzah, offering intimate floating through wooded Ozark hills with relatively consistent water levels.',
};

function getEddyImage(code?: ConditionCode | null): string {
  if (!code) return EDDY_IMAGES.flag;
  switch (code) {
    case 'optimal':
    case 'low':
      return EDDY_IMAGES.green;
    case 'high':
    case 'dangerous':
      return EDDY_IMAGES.red;
    case 'very_low':
      return EDDY_IMAGES.yellow;
    default:
      return EDDY_IMAGES.flag;
  }
}

export default function RiversPage() {
  const { data: rivers, isLoading } = useRivers();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section
        className="relative py-12 md:py-20 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="-mb-1">
            <Image
              src={EDDY_IMAGES.canoe}
              alt="Eddy the Otter in a canoe"
              width={400}
              height={400}
              className="mx-auto h-32 md:h-40 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Missouri Float Rivers
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Explore our supported rivers with live conditions, access points, and float planning tools.
          </p>
        </div>
      </section>

      {/* River Cards */}
      <section className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
            <p className="ml-4 text-neutral-500">Loading rivers...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {rivers?.map((river) => {
              const conditionCode = river.currentCondition?.code;
              const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
              const conditionLabel = conditionCode ? CONDITION_LABELS[conditionCode] : 'Unknown';
              const heroImage = RIVER_IMAGES[river.slug];
              const description = RIVER_DESCRIPTIONS[river.slug];

              return (
                <Link
                  key={river.id}
                  href={`/rivers/${river.slug}`}
                  className="group bg-white rounded-2xl border-2 border-neutral-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-primary-300 transition-all no-underline"
                >
                  {/* Image */}
                  <div className="relative h-44 bg-neutral-100 overflow-hidden">
                    {heroImage ? (
                      <Image
                        src={heroImage}
                        alt={river.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-800 to-primary-900">
                        <Image
                          src={getEddyImage(conditionCode)}
                          alt="Eddy the Otter"
                          width={120}
                          height={120}
                          className="w-20 h-20 object-contain opacity-60"
                        />
                      </div>
                    )}
                    {/* Condition badge overlay */}
                    <div className="absolute top-3 right-3">
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-lg"
                        style={{ backgroundColor: conditionColor }}
                      >
                        <Image
                          src={getEddyImage(conditionCode)}
                          alt=""
                          width={20}
                          height={20}
                          className="w-4 h-4 object-contain"
                        />
                        {conditionLabel}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h2 className="text-xl font-bold text-neutral-900 group-hover:text-primary-600 transition-colors">
                        {river.name}
                      </h2>
                      <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                    </div>

                    {description && (
                      <p className="text-sm text-neutral-600 leading-relaxed mb-3 line-clamp-2">
                        {description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5" />
                        {river.lengthMiles} miles
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {river.accessPointCount} access points
                      </span>
                      {river.region && (
                        <span className="text-neutral-400">{river.region}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-primary-200 mb-2">
            Eddy &middot; Missouri River Float Trip Planner
          </p>
          <p className="text-sm text-primary-300">
            Water data from USGS &middot; Always check local conditions before floating
          </p>
        </div>
      </footer>
    </div>
  );
}
