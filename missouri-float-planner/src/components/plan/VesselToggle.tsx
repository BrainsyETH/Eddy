'use client';

// src/components/plan/VesselToggle.tsx
// Toggle between canoe and raft vessel types

import { useVesselTypes } from '@/hooks/useVesselTypes';

interface VesselToggleProps {
  selectedVesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default function VesselToggle({
  selectedVesselTypeId,
  onVesselChange,
  disabled = false,
  size = 'md',
}: VesselToggleProps) {
  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  if (!canoeVessel || !raftVessel) return null;

  const sizeClasses = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  const containerClasses = size === 'sm'
    ? 'rounded-lg p-1 bg-white border border-neutral-200'
    : 'rounded-lg p-1 border-2 border-neutral-200 bg-neutral-100';

  return (
    <div className={`inline-flex items-center ${containerClasses}`}>
      <button
        onClick={() => onVesselChange(canoeVessel.id)}
        disabled={disabled}
        className={`${sizeClasses[size]} font-bold rounded-md transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${
          selectedVesselTypeId === canoeVessel.id
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        🛶 Canoe
      </button>
      <button
        onClick={() => onVesselChange(raftVessel.id)}
        disabled={disabled}
        className={`${sizeClasses[size]} font-bold rounded-md transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${
          selectedVesselTypeId === raftVessel.id
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        🚣 Raft
      </button>
    </div>
  );
}
