'use client';
// src/components/access-point/sections/DetailText.tsx
// The three ways an access-point section shows information, so every section
// reads the same:
//
//   FactRow     a short label and a short value ("Capacity · 20 vehicles").
//               Values are a word or a phrase. Anything longer is prose.
//   ProseBlock  free text, full width and left-aligned, clamped to three lines
//               with a "More" toggle. Prose was being pushed into the right
//               column of a label/value row, which turned a paragraph into a
//               ragged right-aligned block.
//   SourceNote  one small line naming the agencies whose published data the
//               page uses. Attribution lives here, not inside the sentences.

import { useLayoutEffect, useRef, useState } from 'react';
import { sourceLine } from '@/lib/access-points/source-line';

export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-neutral-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-neutral-900 font-medium text-right">{value}</span>
    </div>
  );
}

export function ProseBlock({ text, lines = 3 }: { text: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Only offer "More" when the clamp actually hides something.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div>
      <p
        ref={ref}
        className="text-sm text-neutral-700 leading-relaxed"
        style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-medium text-primary-700 hover:text-primary-800"
          aria-expanded={expanded}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

export function SourceNote({ sources }: { sources: string[] | undefined }) {
  const line = sourceLine(sources);
  return line ? <p className="text-xs text-neutral-400">{line}</p> : null;
}
