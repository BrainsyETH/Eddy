'use client';

// src/components/river/RiverOverviewPanel.tsx
// River detail overview panel as bottom sheet

import { useEffect } from 'react';
import type { RiverWithDetails, RiverCondition, ConditionCode } from '@/types/api';

interface RiverOverviewPanelProps {
  river: RiverWithDetails | null;
  condition: RiverCondition | null;
  accessPointCount: number;
  isOpen: boolean;
  onClose: () => void;
}

const conditionStyles: Record<ConditionCode, { bg: string; text: string; icon: string }> = {
  optimal: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✓' },
  low: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '↓' },
  very_low: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '⚠' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '↑' },
  too_low: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕' },
  dangerous: { bg: 'bg-red-200', text: 'text-red-800', icon: '⚠' },
  unknown: { bg: 'bg-bluff-100', text: 'text-bluff-600', icon: '?' },
};

export default function RiverOverviewPanel({
  river,
  condition,
  accessPointCount,
  isOpen,
  onClose,
}: RiverOverviewPanelProps) {
  const conditionStyle = condition ? conditionStyles[condition.code] : conditionStyles.unknown;

  // Prevent body scroll when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !river) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Bottom Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-1rem)]">
          {/* Header section with image */}
          <div className="relative bg-gradient-to-r from-ozark-800 to-ozark-700 px-5 py-4 text-white overflow-hidden">
            {/* Image placeholder */}
            <div className="absolute inset-0 opacity-20">
              <div className="w-full h-full bg-gradient-to-br from-river-water/30 via-river-forest/20 to-sky-warm/20 flex items-center justify-center">
                <svg className="w-32 h-32 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="relative flex justify-between items-start z-10">
              <div>
                <h2 className="text-lg font-bold">{river.name}</h2>
                <p className="text-river-300 text-sm mt-0.5">Plan your float with live conditions</p>
              </div>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors p-1"
                aria-label="Close river panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bluff-50 rounded-xl p-3">
            <p className="text-xs font-medium text-bluff-500 uppercase tracking-wide">Length</p>
            <p className="text-xl font-bold text-ozark-800">{river.lengthMiles.toFixed(1)} mi</p>
          </div>
          <div className="bg-river-50 rounded-xl p-3">
            <p className="text-xs font-medium text-river-600 uppercase tracking-wide">Access Points</p>
            <p className="text-xl font-bold text-river-700">{accessPointCount}</p>
          </div>
        </div>

        <div className={`rounded-xl p-3 ${conditionStyle.bg}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{conditionStyle.icon}</span>
            <div>
              <p className={`font-semibold ${conditionStyle.text}`}>
                {condition?.label ?? 'Condition unavailable'}
              </p>
              {condition?.gaugeHeightFt !== null && condition?.gaugeHeightFt !== undefined && (
                <p className={`text-sm ${conditionStyle.text} opacity-75`}>
                  Stage: {condition.gaugeHeightFt.toFixed(2)} ft
                </p>
              )}
            </div>
          </div>
          {condition?.dischargeCfs !== null && condition?.dischargeCfs !== undefined && (
            <p className={`text-sm ${conditionStyle.text} opacity-75 mt-1`}>
              Flow: {condition.dischargeCfs.toLocaleString()} cfs
            </p>
          )}
          {condition?.readingTimestamp && (
            <p className="text-xs text-bluff-600 mt-1">
              Updated {new Date(condition.readingTimestamp).toLocaleString()}
            </p>
          )}
        </div>

        {river.description && (
          <div className="bg-bluff-50 rounded-xl p-3">
            <p className="text-xs font-medium text-bluff-500 uppercase tracking-wide mb-2">
              About this river
            </p>
            <p className="text-sm text-ozark-700">{river.description}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs text-bluff-600">
          {river.region && (
            <span className="px-3 py-1 rounded-full bg-bluff-100">Region: {river.region}</span>
          )}
          {river.difficultyRating && (
            <span className="px-3 py-1 rounded-full bg-river-100">
              Difficulty: {river.difficultyRating}
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-sunset-100">Tubing friendly</span>
          <span className="px-3 py-1 rounded-full bg-emerald-100">Dog friendly</span>
        </div>

        <div className="bg-amber-50 rounded-xl p-4 border-2 border-amber-200">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
            Community Notes
          </p>
          <p className="text-sm text-amber-900 font-medium">
            No active warnings yet. Share updates about obstacles or closures with the community.
          </p>
          <button className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg border-2 border-amber-700 transition-colors">
            Add Note
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
