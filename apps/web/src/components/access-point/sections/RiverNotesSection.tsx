// src/components/access-point/sections/RiverNotesSection.tsx
// Local tips and river notes section (Eddy tips 🦦)

import EddyTip from '../EddyTip';

interface RiverNotesSectionProps {
  tips: string;
}

export default function RiverNotesSection({ tips }: RiverNotesSectionProps) {
  if (!tips) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No river notes available yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <EddyTip>
        {/* Render HTML from TipTap */}
        <div
          className="prose prose-sm prose-neutral max-w-none"
          dangerouslySetInnerHTML={{ __html: tips }}
        />
      </EddyTip>
    </div>
  );
}
