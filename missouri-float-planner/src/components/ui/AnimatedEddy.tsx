'use client';

// src/components/ui/AnimatedEddy.tsx
// Eddy otter with condition-based mood animations

import Image from 'next/image';
import { getEddyImageForCondition } from '@/constants';

interface AnimatedEddyProps {
  conditionCode: string;
  size?: number;
  className?: string;
}

const MOOD_CLASSES: Record<string, string> = {
  flowing: 'eddy-paddle',
  good: 'eddy-paddle',
  low: 'eddy-worry',
  too_low: 'eddy-worry',
  high: 'eddy-alert',
  dangerous: 'eddy-bob',
  unknown: '',
};

export default function AnimatedEddy({ conditionCode, size = 40, className = '' }: AnimatedEddyProps) {
  const src = getEddyImageForCondition(conditionCode);
  const moodClass = MOOD_CLASSES[conditionCode] || '';

  return (
    <div className={`relative flex-shrink-0 ${moodClass} ${className}`} style={{ width: size, height: size }}>
      <Image
        src={src}
        alt="Eddy"
        fill
        className="object-contain"
        sizes={`${size}px`}
      />
    </div>
  );
}
