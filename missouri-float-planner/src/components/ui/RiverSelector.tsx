'use client';

// src/components/ui/RiverSelector.tsx
// Dropdown component for selecting a river

import { useState, useEffect } from 'react';
import type { RiverListItem } from '@/types/api';

interface RiverSelectorProps {
  rivers: RiverListItem[];
  selectedRiverId: string | null;
  onSelect: (riverId: string) => void;
  className?: string;
}

export default function RiverSelector({
  rivers,
  selectedRiverId,
  onSelect,
  className = '',
}: RiverSelectorProps) {
  const selectedRiver = rivers.find((r) => r.id === selectedRiverId);

  return (
    <div className={`relative ${className}`}>
      <select
        value={selectedRiverId || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
      >
        <option value="">Select a river...</option>
        {rivers.map((river) => (
          <option key={river.id} value={river.id}>
            {river.name}
            {river.currentCondition && (
              <span className="text-gray-500">
                {' '}
                - {river.currentCondition.label}
              </span>
            )}
          </option>
        ))}
      </select>
      {selectedRiver && selectedRiver.currentCondition && (
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium">Current Condition:</span>{' '}
          {selectedRiver.currentCondition.label}
        </div>
      )}
    </div>
  );
}
