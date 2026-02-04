'use client';

// src/components/river/LocalKnowledge.tsx
// Collapsible Local Knowledge section for river pages

import { useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Information icon URL from Vercel blob storage
const INFO_ICON_URL = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/information-icon.png';

// River-specific floating summaries (local knowledge - SAFETY FIRST)
const RIVER_SUMMARIES: Record<string, { title: string; summary: string; tip: string }> = {
  'current-river': {
    title: 'Current River',
    summary: 'The Akers gauge is the primary reference. 2.0–3.0 ft is optimal. The Current is spring-fed and forgiving, but above 3.5 ft conditions deteriorate. At 4.0 ft the river closes. Below 1.5 ft you\'ll drag in riffles. Van Buren (lower river) runs higher—optimal 3.0–4.0 ft, closes at 5.0 ft.',
    tip: 'Spring rains can cause rapid rises. If the gauge is climbing, consider another day. The upper Current (Montauk to Akers) needs slightly more water than lower sections.',
  },
  'eleven-point-river': {
    title: 'Eleven Point River',
    summary: 'The Bardley gauge (16 mi downstream from Greer) is the key reference. 3.0–3.5 ft is optimal. Average is ~3.0 ft. Above 4 ft we recommend another day—water gets murky and conditions deteriorate. At 5 ft, outfitters stop and Forest Service closes the river.',
    tip: 'Mid-June through mid-September offers the best floating with clear water. Spring rains (March–May) cause rapid rises and muddy conditions. When in doubt, wait it out.',
  },
  'jacks-fork-river': {
    title: 'Jacks Fork River',
    summary: 'The Jacks Fork is shallower and more rain-dependent. At Alley Spring (primary), 2.5–3.0 ft is ideal. Above 3.5 ft we recommend another day—river closes at 4.0 ft. Below 2.0 ft you\'ll drag with gear. At Eminence (lower), 2.0–3.0 ft is good; average is ~1.5 ft but may drag loaded.',
    tip: 'The Jacks Fork rises and falls FAST after rain. Flash floods are a serious concern. If rain is forecast or the gauge is rising, postpone your trip.',
  },
};

interface LocalKnowledgeProps {
  riverSlug: string;
  riverName: string;
  defaultOpen?: boolean;
}

export default function LocalKnowledge({ riverSlug, riverName, defaultOpen = false }: LocalKnowledgeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Get summary for this river
  const summary = RIVER_SUMMARIES[riverSlug];

  // Don't render if no summary exists for this river
  if (!summary) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-primary-50 to-accent-50 border-2 border-primary-200 rounded-xl overflow-hidden">
      {/* Header - Always visible, clickable to expand/collapse */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-primary-100/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center">
            <Image
              src={INFO_ICON_URL}
              alt="Information"
              width={20}
              height={20}
              className="invert"
            />
          </div>
          <div>
            <h3 className="font-bold text-neutral-900">
              {riverName} — Local Knowledge
            </h3>
            {!isOpen && (
              <p className="text-xs text-neutral-500 mt-0.5">Tap to learn about optimal conditions</p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 ml-2">
          {isOpen ? (
            <ChevronUp size={20} className="text-neutral-500" />
          ) : (
            <ChevronDown size={20} className="text-neutral-500" />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-0">
          <div className="pl-13">
            <p className="text-sm text-neutral-700 mb-3">
              {summary.summary}
            </p>
            <p className="text-xs text-primary-700 bg-primary-100 rounded-lg px-3 py-2 inline-block">
              <span className="font-semibold">💡 Tip:</span> {summary.tip}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
