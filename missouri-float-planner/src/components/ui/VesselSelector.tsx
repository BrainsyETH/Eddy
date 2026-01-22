'use client';

// src/components/ui/VesselSelector.tsx
// Component for selecting vessel type

import type { VesselType } from '@/types/api';

interface VesselSelectorProps {
  vesselTypes: VesselType[];
  selectedVesselTypeId: string | null;
  onSelect: (vesselTypeId: string) => void;
  className?: string;
}

const vesselIcons: Record<string, string> = {
  raft: '🛶',
  canoe: '🛶',
  kayak: '🛶',
  tube: '🛟',
};

export default function VesselSelector({
  vesselTypes,
  selectedVesselTypeId,
  onSelect,
  className = '',
}: VesselSelectorProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {vesselTypes.map((vessel) => {
        const isSelected = vessel.id === selectedVesselTypeId;
        return (
          <button
            key={vessel.id}
            onClick={() => onSelect(vessel.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all
              ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <span className="text-xl">
              {vesselIcons[vessel.icon] || '🛶'}
            </span>
            <span className="font-medium">{vessel.name}</span>
          </button>
        );
      })}
    </div>
  );
}
