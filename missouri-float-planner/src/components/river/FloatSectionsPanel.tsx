'use client';

// src/components/river/FloatSectionsPanel.tsx
// Shows all floatable sections for a river with highlights, crowd level, and "Plan This Float" CTAs

import { useState } from 'react';
import { MapPin, Clock, Users, TreePine, Star, ChevronDown, ChevronUp, Lightbulb, ArrowRight } from 'lucide-react';
import { getRiverHighlights } from '@/data/section-highlights';
import type { SectionHighlight } from '@/data/section-highlights';
import type { AccessPoint } from '@/types/api';

interface FloatSectionsPanelProps {
  riverSlug: string;
  accessPoints: AccessPoint[];
  onSelectSection: (putInId: string, takeOutId: string) => void;
}

const crowdLabels = {
  low: { label: 'Quiet', icon: TreePine, color: 'text-support-600' },
  moderate: { label: 'Moderate', icon: Users, color: 'text-yellow-600' },
  high: { label: 'Popular', icon: Users, color: 'text-accent-600' },
};

export default function FloatSectionsPanel({ riverSlug, accessPoints, onSelectSection }: FloatSectionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const highlights = getRiverHighlights(riverSlug);

  if (highlights.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border-2 border-neutral-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-accent-500" />
          <h3 className="text-base font-bold text-neutral-900">Float Sections</h3>
          <span className="text-xs text-neutral-500">{highlights.length} sections</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-3">
          <p className="text-sm text-neutral-600 mb-2">
            Browse popular sections and see what you&apos;ll pass along the way.
          </p>

          {highlights.map((section, index) => (
            <SectionCard
              key={index}
              section={section}
              accessPoints={accessPoints}
              onSelect={onSelectSection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  accessPoints,
  onSelect,
}: {
  section: SectionHighlight;
  accessPoints: AccessPoint[];
  onSelect: (putInId: string, takeOutId: string) => void;
}) {
  const crowd = crowdLabels[section.crowdLevel];
  const CrowdIcon = crowd.icon;

  // Try to find matching access points for "Plan This Float" button
  const putIn = accessPoints.find(ap =>
    ap.name.toLowerCase().includes(section.putInName.toLowerCase().split(' ')[0].toLowerCase())
  );
  const takeOut = accessPoints.find(ap =>
    ap.name.toLowerCase().includes(section.takeOutName.toLowerCase().split(' ')[0].toLowerCase())
  );

  // Calculate approximate distance if both points found
  const distance = putIn && takeOut
    ? Math.abs(takeOut.riverMile - putIn.riverMile).toFixed(1)
    : null;

  return (
    <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="text-sm font-bold text-neutral-900">
            {section.putInName} &rarr; {section.takeOutName}
          </h4>
          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
            {distance && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {distance} mi
              </span>
            )}
            <span className={`flex items-center gap-1 ${crowd.color}`}>
              <CrowdIcon className="w-3 h-3" />
              {crowd.label}
            </span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: section.sceneryRating }).map((_, i) => (
                <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              ))}
            </span>
          </div>
        </div>

        {putIn && takeOut && (
          <button
            onClick={() => onSelect(putIn.id, takeOut.id)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Plan this
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-600 mb-2">{section.description}</p>

      {/* Highlights pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {section.highlights.map((h) => (
          <span key={h} className="text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
            {h}
          </span>
        ))}
      </div>

      {/* Tip */}
      {section.tip && (
        <div className="flex items-start gap-1.5 text-xs text-neutral-500">
          <Lightbulb className="w-3 h-3 text-accent-500 shrink-0 mt-0.5" />
          <span>{section.tip}</span>
        </div>
      )}
    </div>
  );
}
