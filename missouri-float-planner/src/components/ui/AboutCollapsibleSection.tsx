'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AboutCollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 mb-6 w-full text-left group"
      >
        <div className="p-3 rounded-lg" style={{ backgroundColor: '#2D7889' }}>
          {icon}
        </div>
        <h2 className="text-3xl font-bold text-neutral-900 flex-1">{title}</h2>
        <ChevronDown
          className={`w-6 h-6 text-neutral-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </section>
  );
}
