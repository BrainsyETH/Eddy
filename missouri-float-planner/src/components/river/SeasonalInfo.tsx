'use client';

// src/components/river/SeasonalInfo.tsx
// Seasonal guidance and crowd calendar for a river

import { useState } from 'react';
import { Calendar, Users, TreePine, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { getSeasonalData } from '@/data/seasonal-data';

interface SeasonalInfoProps {
  riverSlug: string;
}

const crowdColors = {
  low: 'bg-support-100 text-support-700 border-support-200',
  moderate: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-accent-50 text-accent-700 border-accent-200',
};

const crowdLabels = {
  low: 'Quiet',
  moderate: 'Moderate',
  high: 'Busy',
};

export default function SeasonalInfo({ riverSlug }: SeasonalInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const data = getSeasonalData(riverSlug);

  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border-2 border-neutral-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-600" />
          <h3 className="text-base font-bold text-neutral-900">When to Float</h3>
          <span className="text-xs text-neutral-500">Best: {data.bestMonths}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-4">
          {/* Season Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.seasonalNotes.map((note) => (
              <div
                key={note.months}
                className={`p-3 rounded-lg border ${crowdColors[note.crowdLevel]}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{note.label}</span>
                  <span className="text-[10px] font-medium">{note.months}</span>
                </div>
                <p className="text-xs leading-relaxed">{note.description}</p>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] opacity-75">
                  {note.crowdLevel === 'low' ? <TreePine className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                  {crowdLabels[note.crowdLevel]}
                </div>
              </div>
            ))}
          </div>

          {/* Water Notes */}
          <div className="p-3 bg-primary-50 rounded-lg">
            <p className="text-xs text-primary-800">
              <strong>Water levels:</strong> {data.waterNotes}
            </p>
          </div>

          {/* Crowd Tips */}
          {data.crowdTips.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2 flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-accent-500" />
                Crowd Tips
              </h4>
              <ul className="space-y-1">
                {data.crowdTips.map((tip, i) => (
                  <li key={i} className="text-xs text-neutral-600 flex items-start gap-2">
                    <span className="text-accent-500 mt-0.5">&bull;</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
