'use client';

// src/components/ui/ConditionPulse.tsx
// Animated pulse ring around condition dot for live-feeling status indicators

import { CONDITION_COLORS } from '@/constants';

interface ConditionPulseProps {
  conditionCode: string;
  size?: 'sm' | 'md';
  className?: string;
}

// Only pulse for conditions that signal activity
const PULSE_CODES = new Set(['flowing', 'good', 'high', 'dangerous']);

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ConditionPulse({ conditionCode, size = 'sm', className = '' }: ConditionPulseProps) {
  const color = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const shouldPulse = PULSE_CODES.has(conditionCode);
  const dotSize = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <span
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <span
        className={`${dotSize} rounded-full ${shouldPulse ? 'condition-pulse' : ''}`}
        style={{
          backgroundColor: color,
          ...(shouldPulse
            ? {
                '--pulse-color': hexToRgba(color, 0.6),
                '--pulse-color-transparent': hexToRgba(color, 0),
              } as React.CSSProperties
            : {}),
        }}
      />
    </span>
  );
}
