'use client';

// src/components/plan/ConditionBadge.tsx
// Reusable condition badge component

import { getConditionConfig } from '@/constants';
import type { ConditionCode } from '@/types/api';

interface ConditionBadgeProps {
  code: ConditionCode;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export default function ConditionBadge({
  code,
  size = 'md',
  showIcon = true,
  className = '',
}: ConditionBadgeProps) {
  const config = getConditionConfig(code);

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded ${config.bgClass} ${config.textClass} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.shortLabel}</span>
    </span>
  );
}
