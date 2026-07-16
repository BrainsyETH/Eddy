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
    // Mobile: one edge-to-edge horizontal scroll row (no ragged 3-row wrap;
    // the negative margin lets it bleed past the page's px-4 gutter and the
    // scrollbar is hidden). sm+: normal wrapping within the content column.
    <div
      className="-mx-4 mb-4 flex flex-nowrap gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {FILTERS.map((f) => {
        const isActive = active === f.value;
        return (
          <button
            key={f.value}
            onClick={() => handleClick(f.value)}
            aria-pressed={isActive}
            aria-label={
              f.value === 'all'
                ? 'Show all rivers'
                : `Filter rivers by ${f.label} condition`
            }
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              isActive
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:text-primary-700'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export type { FilterType };
