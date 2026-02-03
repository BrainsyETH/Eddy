// src/components/access-point/AccessPointSection.tsx
// Collapsible section wrapper for access point detail

'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Badge {
  label: string;
  variant?: 'default' | 'warning' | 'success';
}

interface AccessPointSectionProps {
  icon: string;
  title: string;
  badge?: Badge | null;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function AccessPointSection({
  icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: AccessPointSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const badgeColors = {
    default: 'bg-neutral-100 text-neutral-700',
    warning: 'bg-amber-100 text-amber-800',
    success: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          isOpen ? 'bg-neutral-50' : 'hover:bg-neutral-50'
        }`}
      >
        <span className="text-lg w-6 text-center flex-shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-neutral-900">
          {title}
        </span>
        {badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              badgeColors[badge.variant || 'default']
            }`}
          >
            {badge.label}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pl-[52px]">{children}</div>
      </div>
    </div>
  );
}
