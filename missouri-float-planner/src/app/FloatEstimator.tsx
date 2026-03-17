'use client';

// FloatEstimator — client island for the home page float trip planning form

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { useAccessPoints } from '@/hooks/useAccessPoints';
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

  // Check if form is complete
  const canSubmit = selectedRiverSlug && selectedPutIn && selectedTakeOut;

  return (
    <div className="glass-card-dark rounded-2xl p-5 lg:p-6 border border-white/10 flex flex-col">
      {/* Header with Eddy */}
      <div className="flex items-center gap-3 mb-4">
        <Image
          src={EDDY_CANOE_IMAGE}
          alt="Eddy the Otter in a canoe"
          width={120}
          height={120}
          className="w-12 h-12 md:w-14 md:h-14 object-contain"
        />
        <h2 className="text-xl lg:text-2xl font-bold text-white">Plan Your Float</h2>
      </div>

      {/* Selectors - Stacked vertically for compact layout */}
      <div className="space-y-3 flex-1">
        {/* River Select */}
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">River</label>
          <div className="relative">
            <select
              value={selectedRiverSlug}
              onChange={(e) => handleRiverChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm"
            >
              <option value="" className="bg-neutral-800">Select river...</option>
              {rivers.map(river => (
                <option key={river.id} value={river.slug} className="bg-neutral-800">{river.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
          </div>
        </div>

        {/* Put-In and Take-Out in a row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Put-In Select */}
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Put-In</label>
            <div className="relative">
              <select
                value={selectedPutIn}
                onChange={(e) => handlePutInChange(e.target.value)}
                disabled={!selectedRiverSlug || accessPointsLoading}
                className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="" className="bg-neutral-800">{accessPointsLoading ? 'Loading...' : 'Select...'}</option>
                {accessPoints.map(ap => (
                  <option key={ap.id} value={ap.id} className="bg-neutral-800">
                    {ap.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
          </div>

          {/* Take-Out Select */}
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Take-Out</label>
            <div className="relative">
              <select
                value={selectedTakeOut}
                onChange={(e) => setSelectedTakeOut(e.target.value)}
                disabled={!selectedPutIn}
                className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="" className="bg-neutral-800">Select...</option>
                {takeOutOptions.map(ap => (
                  <option key={ap.id} value={ap.id} className="bg-neutral-800">
                    {ap.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="mt-4 pt-4 border-t border-white/10">
        {canSubmit ? (
          <Link
            href={`/rivers/${selectedRiverSlug}?putIn=${selectedPutIn}&takeOut=${selectedTakeOut}`}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
          >
            View Trip Details
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <button
            disabled
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/10 text-white/50 font-semibold rounded-xl cursor-not-allowed"
          >
            Select all options above
          </button>
        )}
      </div>
    </div>
  );
}
