'use client';

// src/app/rivers/[slug]/RiverGuideDisclosure.tsx
// Progressive disclosure for the deep river-guide content so it doesn't bury
// the status → plan path. Collapsed by default.

import { useState, type ReactNode } from 'react';

export default function RiverGuideDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {open && <div className="space-y-4 mb-4">{children}</div>}
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold text-primary-700 border border-neutral-300 hover:bg-neutral-50 transition-colors"
      >
        {open ? 'Hide full guide' : 'Read the full guide'}
      </button>
    </div>
  );
}
