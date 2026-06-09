// src/components/access-point/EddyTip.tsx
// Eddy tip callout with otter icon 🦦

import type { ReactNode } from 'react';

interface EddyTipProps {
  children: ReactNode;
}

export default function EddyTip({ children }: EddyTipProps) {
  return (
    <div className="flex gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <span className="text-base flex-shrink-0 mt-0.5">🦦</span>
      <div className="text-sm text-amber-900 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
