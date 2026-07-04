'use client';

// src/components/access-point/AccessPointShareButton.tsx
// Client island for the access-point page's Share action, so the surrounding
// page can render on the server.

import { useCallback, useState } from 'react';
import { Share2, Copy } from 'lucide-react';

export default function AccessPointShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const shareUrl = window.location.href;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: title || 'Access Point', url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  }, [title]);

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
    >
      {copied ? (
        <>
          <Copy className="w-4 h-4" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          Share
        </>
      )}
    </button>
  );
}
