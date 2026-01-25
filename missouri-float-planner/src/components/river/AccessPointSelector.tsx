'use client';

// src/components/river/AccessPointSelector.tsx
// Dropdown selector for access points with type filtering

import { useState, useRef, useEffect } from 'react';
import type { AccessPoint } from '@/types/api';

// Available access point types
const ACCESS_POINT_TYPES = [
  { value: 'boat_ramp', label: 'Boat Ramp', emoji: '🚤' },
  { value: 'gravel_bar', label: 'Gravel Bar', emoji: '🪨' },
  { value: 'campground', label: 'Campground', emoji: '🏕️' },
  { value: 'bridge', label: 'Bridge', emoji: '🌉' },
  { value: 'access', label: 'Access', emoji: '📍' },
  { value: 'park', label: 'Park', emoji: '🌲' },
];

interface AccessPointSelectorProps {
  accessPoints: AccessPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  excludeId?: string | null;
  referenceMile?: number | null;
  warnUpstream?: boolean;
}

export default function AccessPointSelector({
  accessPoints,
  selectedId,
  onSelect,
  placeholder = 'Select access point...',
  excludeId,
  referenceMile = null,
  warnUpstream = false,
}: AccessPointSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedPoint = accessPoints.find((p) => p.id === selectedId);

  // Filter by excludeId first
  const filteredPoints = excludeId
    ? accessPoints.filter((p) => p.id !== excludeId)
    : accessPoints;

  // Then filter by selected types
  const typeFilteredPoints = selectedTypes.size > 0
    ? filteredPoints.filter((p) => selectedTypes.has(p.type))
    : filteredPoints;

  // Then filter by search term
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visiblePoints = normalizedSearch
    ? typeFilteredPoints.filter((point) => {
        const haystack = `${point.name} ${point.type} ${point.riverMile}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : typeFilteredPoints;

  // Toggle type filter
  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

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
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full px-4 py-3 bg-white border-2 border-neutral-200 rounded-lg
                   shadow-sm hover:shadow-md hover:border-primary-400
                   flex items-center justify-between gap-3 transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          {selectedPoint ? (
            <>
              <span className="text-xl">
                {selectedPoint.type === 'boat_ramp' ? '🚤' :
                 selectedPoint.type === 'campground' ? '🏕️' :
                 selectedPoint.type === 'bridge' ? '🌉' : '📍'}
              </span>
              <div>
                <p className="font-medium text-neutral-900">{selectedPoint.name}</p>
                <p className="text-sm text-neutral-500">
                  Mile {selectedPoint.riverMile.toFixed(1)} • {selectedPoint.type.replace('_', ' ')}
                </p>
              </div>
            </>
          ) : (
            <span className="text-neutral-500">{placeholder}</span>
          )}
        </div>
        {selectedPoint && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(null);
            }}
            className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
            title="Clear selection"
          >
            <svg className="w-4 h-4 text-neutral-400 hover:text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <svg
          className={`w-5 h-5 text-neutral-500 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border-2 border-neutral-200
                        rounded-lg shadow-lg overflow-hidden animate-in">
          <div className="p-3 border-b border-neutral-200 space-y-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search access points..."
              className="w-full rounded-md border-2 border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {/* Type Filter Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTypeFilter(!showTypeFilter);
              }}
              className="w-full flex items-center justify-between text-xs text-neutral-600 hover:text-primary-600 transition-colors py-1"
            >
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter by Type
                {selectedTypes.size > 0 && (
                  <span className="bg-primary-500 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                    {selectedTypes.size}
                  </span>
                )}
              </span>
              <span>{showTypeFilter ? '▲' : '▼'}</span>
            </button>
            {/* Type Filter Options */}
            {showTypeFilter && (
              <div className="bg-neutral-50 rounded-lg p-2">
                <div className="flex justify-between items-center mb-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedTypes(new Set(ACCESS_POINT_TYPES.map(t => t.value)));
                    }}
                    className="text-[10px] text-primary-600 hover:text-primary-700"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedTypes(new Set());
                    }}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {ACCESS_POINT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleType(type.value);
                      }}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] transition-colors ${
                        selectedTypes.has(type.value)
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span>{type.emoji}</span>
                      <span className="truncate">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {visiblePoints.length === 0 ? (
              <div className="px-4 py-3 text-sm text-neutral-500 text-center">
                No access points available
              </div>
            ) : (
              visiblePoints.map((point) => {
                const isUpstream =
                  warnUpstream && referenceMile !== null && point.riverMile < referenceMile;

                return (
                <button
                  key={point.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(point.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-primary-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset
                             ${point.id === selectedId ? 'bg-primary-50' : ''}`}
                >
                  <span className="text-xl flex-shrink-0">
                    {point.type === 'boat_ramp' ? '🚤' :
                     point.type === 'campground' ? '🏕️' :
                     point.type === 'bridge' ? '🌉' : '📍'}
                  </span>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-neutral-900">{point.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-neutral-500">
                        Mile {point.riverMile.toFixed(1)}
                      </span>
                      <span className="text-neutral-300">•</span>
                      <span className="text-sm text-neutral-500">
                        {point.type.replace('_', ' ')}
                      </span>
                      {point.feeRequired && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <span className="text-xs text-accent-600">Fee Required</span>
                        </>
                      )}
                      {isUpstream && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <span className="text-xs text-red-600">Upstream</span>
                        </>
                      )}
                    </div>
                  </div>
                  {point.id === selectedId && (
                    <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
