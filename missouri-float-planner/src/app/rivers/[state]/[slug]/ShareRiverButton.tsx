'use client';

// src/app/rivers/[state]/[slug]/ShareRiverButton.tsx
// Hero share action for the river hub — native share sheet on touch devices,
// clipboard elsewhere. Mirrors the share behavior the Eddy Says card uses.

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

export default function ShareRiverButton({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = window.location.href.split('#')[0];
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && navigator.share) {
      try { await navigator.share({ url: shareUrl }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard failed */ }
  };

  return (
    <button onClick={handleShare} className={className}>
      {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
