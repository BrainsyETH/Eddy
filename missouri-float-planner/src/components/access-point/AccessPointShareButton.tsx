'use client';

// src/components/access-point/AccessPointShareButton.tsx
// Client island for the access-point page's Share action, so the surrounding
// page can render on the server.

import { Share2, Copy } from 'lucide-react';
import { canonicalShareUrl } from '@/lib/share-link';
import { SHARE_LABEL, ShareAnnouncement, useShareLink } from '@/components/ui/share-link';

interface Props {
  title: string;
  /** The access point's canonical path, not the address bar's. */
  path: string;
}

export default function AccessPointShareButton({ title, path }: Props) {
  const { status, share } = useShareLink();

  const handleShare = async () => {
    const url = canonicalShareUrl(path);
    const outcome = await share({ title: title || 'Access Point', url });
    // Last resort when the clipboard is unavailable: show the link to copy by hand.
    if (outcome === 'failed') window.prompt('Copy this link:', url);
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
      >
        {status === 'copied' ? <Copy className="w-4 h-4" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
        {status === 'idle' ? 'Share' : SHARE_LABEL[status]}
      </button>
      <ShareAnnouncement status={status} />
    </>
  );
}
