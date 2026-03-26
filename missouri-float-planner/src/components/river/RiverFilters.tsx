'use client';

// src/components/river/RiverFilters.tsx
// Client-side filter pills for the rivers index page

import { useState } from 'react';

type FilterType = 'all' | 'flowing' | 'good' | 'ozark_nsr' | 'stl_area';

interface RiverFiltersProps {
  onFilterChange: (filter: FilterType) => void;
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All Rivers' },
  { value: 'flowing', label: 'Flowing Now' },
  { value: 'good', label: 'Good Conditions' },
  { value: 'ozark_nsr', label: 'Ozark NSR' },
  { value: 'stl_area', label: 'St. Louis Area' },
];

export default function RiverFilters({ onFilterChange }: RiverFiltersProps) {
  const [active, setActive] = useState<FilterType>('all');

  const handleClick = (filter: FilterType) => {
    setActive(filter);
    onFilterChange(filter);
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => handleClick(f.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
            active === f.value
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:text-primary-700'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export type { FilterType };
