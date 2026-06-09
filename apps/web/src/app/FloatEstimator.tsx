'use client';

// FloatEstimator — client island for the home page float trip planning form

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { CONDITION_COLORS } from '@/constants';
import type { ConditionCode } from '@/types/api';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

interface FloatEstimatorProps {
  rivers: Array<{
    id: string;
    name: string;
    slug: string;
    lengthMiles: number;
    currentCondition?: { code: ConditionCode } | null;
  }>;
}

export default function FloatEstimator({ rivers }: FloatEstimatorProps) {
  const [selectedRiverSlug, setSelectedRiverSlug] = useState<string>('');
  const [selectedPutIn, setSelectedPutIn] = useState<string>('');
  const [selectedTakeOut, setSelectedTakeOut] = useState<string>('');

  // Fetch access points for selected river
  const { data: accessPoints = [], isLoading: accessPointsLoading } = useAccessPoints(selectedRiverSlug || null);

  // Filter take-out options to only show points downstream of put-in
  const takeOutOptions = useMemo(() => {
    if (!selectedPutIn) return accessPoints;
    const putIn = accessPoints.find((ap) => ap.id === selectedPutIn);
    if (!putIn) return accessPoints;
    return accessPoints.filter((ap) => ap.riverMile > putIn.riverMile);
  }, [selectedPutIn, accessPoints]);

  // Reset selections when river changes
  const handleRiverChange = (slug: string) => {
    setSelectedRiverSlug(slug);
    setSelectedPutIn('');
    setSelectedTakeOut('');
  };

  // Reset take-out when put-in changes
  const handlePutInChange = (id: string) => {
    setSelectedPutIn(id);
    setSelectedTakeOut('');
  };

  const canSubmit = selectedRiverSlug && selectedPutIn && selectedTakeOut;

  // Get condition color for selected river
  const selectedRiver = rivers.find(r => r.slug === selectedRiverSlug);

  return (
    <div id="plan" className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 scroll-mt-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Image
          src={EDDY_CANOE_IMAGE}
          alt="Eddy the Otter in a canoe"
          width={120}
          height={120}
          className="w-10 h-10 md:w-12 md:h-12 object-contain"
        />
        <div>
          <h2 className="text-lg md:text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            Plan Your Float
          </h2>
          <p className="text-xs text-neutral-500">Select a river, put-in, and take-out</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-3">
        {/* River Select */}
        <div>
          <label className="block text-sm font-semibold text-neutral-700 mb-1.5">River</label>
          <div className="relative">
            <select
              value={selectedRiverSlug}
              onChange={(e) => handleRiverChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            >
              <option value="">Select river...</option>
              {rivers.map(river => (
                  <option key={river.id} value={river.slug}>
                    {river.name} ({river.lengthMiles} mi)
                  </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {selectedRiver && (
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: CONDITION_COLORS[selectedRiver.currentCondition?.code ?? 'unknown'] || CONDITION_COLORS.unknown }}
                />
              )}
              <ChevronDown className="w-4 h-4 text-neutral-400" />
            </div>
          </div>
        </div>

        {/* Put-In and Take-Out */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Put-In</label>
            <div className="relative">
              <select
                value={selectedPutIn}
                onChange={(e) => handlePutInChange(e.target.value)}
                disabled={!selectedRiverSlug || accessPointsLoading}
                className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="">{accessPointsLoading ? 'Loading...' : 'Select...'}</option>
                {accessPoints.map(ap => (
                  <option key={ap.id} value={ap.id}>{ap.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Take-Out</label>
            <div className="relative">
              <select
                value={selectedTakeOut}
                onChange={(e) => setSelectedTakeOut(e.target.value)}
                disabled={!selectedPutIn}
                className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="">Select...</option>
                {takeOutOptions.map(ap => (
                  <option key={ap.id} value={ap.id}>{ap.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="mt-5 pt-4 border-t border-neutral-100">
        {canSubmit ? (
          <Link
            href={`/plan?river=${selectedRiverSlug}&putIn=${selectedPutIn}&takeOut=${selectedTakeOut}`}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            View Trip Details
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <button
            disabled
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-neutral-100 text-neutral-400 font-semibold rounded-xl cursor-not-allowed"
          >
            Select all options above
          </button>
        )}
      </div>
    </div>
  );
}
