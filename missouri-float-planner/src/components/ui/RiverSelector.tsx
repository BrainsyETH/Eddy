'use client';

// src/components/ui/RiverSelector.tsx
// Themed dropdown component for selecting a river

import { useState, useRef, useEffect } from 'react';
import type { RiverListItem, ConditionCode } from '@/types/api';

interface RiverSelectorProps {
  rivers: RiverListItem[];
  selectedRiverId: string | null;
  onSelect: (riverId: string) => void;
  className?: string;
}

const conditionColors: Record<ConditionCode, string> = {
  optimal: 'bg-emerald-500',
  low: 'bg-lime-500',
  very_low: 'bg-yellow-500',
  high: 'bg-orange-500',
  too_low: 'bg-red-500',
  dangerous: 'bg-red-600',
  unknown: 'bg-bluff-400',
};

export default function RiverSelector({
  rivers,
  selectedRiverId,
  onSelect,
  className = '',
}: RiverSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedRiver = rivers.find((r) => r.id === selectedRiverId);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRivers = normalizedSearch
    ? rivers.filter((river) => {
        const haystack = `${river.name} ${river.region} ${river.difficultyRating}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : rivers;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full px-4 py-3 glass-card-dark border border-white/10 rounded-xl 
                   shadow-card hover:shadow-card-hover hover:border-river-water
                   flex items-center justify-between gap-3 transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-river-500 focus:ring-offset-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-river-water to-river-forest 
                        flex items-center justify-center">
            <span className="text-sm">🌊</span>
          </div>
          <div className="text-left">
            {selectedRiver ? (
              <>
                <p className="font-medium text-white">{selectedRiver.name}</p>
                <p className="text-sm text-river-gravel">
                  {selectedRiver.lengthMiles.toFixed(1)} miles • {selectedRiver.accessPointCount} access points
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-white">Select a River</p>
                <p className="text-sm text-river-gravel">Choose your floating adventure</p>
              </>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-river-gravel transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 glass-card-dark border border-white/10 
                        rounded-xl shadow-lg overflow-hidden animate-in">
          <div className="p-3 border-b border-white/10">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search rivers by name, region, or difficulty..."
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-river-gravel/70 focus:outline-none focus:ring-2 focus:ring-river-500"
            />
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {filteredRivers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-river-gravel text-center">
                No rivers match your search.
              </div>
            ) : (
              filteredRivers.map((river) => (
              <button
                key={river.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(river.id);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors relative
                           focus:outline-none focus:ring-2 focus:ring-river-500 focus:ring-inset
                           ${river.id === selectedRiverId ? 'bg-white/5' : ''}`}
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{river.name}</p>
                    {river.currentCondition && (
                      <span
                        className={`w-2 h-2 rounded-full ${conditionColors[river.currentCondition.code]}`}
                        title={river.currentCondition.label}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-river-gravel">
                      {river.lengthMiles.toFixed(1)} mi
                    </span>
                    <span className="text-river-gravel/50">•</span>
                    <span className="text-sm text-river-gravel">
                      {river.region}
                    </span>
                    <span className="text-river-gravel/50">•</span>
                    <span className="text-sm text-river-gravel">
                      {river.difficultyRating}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {river.id === selectedRiverId && (
                    <svg className="w-5 h-5 text-river-water flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <a
                    href={`/rivers/${river.slug}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      window.location.href = `/rivers/${river.slug}`;
                    }}
                    className="px-2 py-1 text-xs text-river-water hover:text-sky-warm hover:bg-white/5 rounded transition-colors flex-shrink-0"
                    title="View river page"
                  >
                    View →
                  </a>
                </div>
              </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
