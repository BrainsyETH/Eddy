'use client';

// src/components/ui/CollapsibleSection.tsx
// Collapsible section wrapper for mobile-friendly UI

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  badge?: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className = '',
  headerClassName = '',
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white border-2 border-neutral-200 rounded-lg shadow-sm overflow-hidden ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors ${headerClassName}`}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
          {badge}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-neutral-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`transition-all duration-200 ease-in-out ${
          isOpen ? 'max-h-[10000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
