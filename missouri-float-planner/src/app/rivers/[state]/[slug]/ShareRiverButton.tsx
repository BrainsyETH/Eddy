'use client';

// src/app/rivers/[state]/[slug]/ShareRiverButton.tsx
// Hero share action for the river hub — native share sheet on touch devices,
// clipboard elsewhere. Shares the river's name and canonical link, never the
// address bar: that carries whatever campaign or section parameters the
// visitor arrived with.

import { Share2, Check } from 'lucide-react';
import { canonicalShareUrl } from '@/lib/share-link';
import { SHARE_LABEL, ShareAnnouncement, useShareLink } from '@/components/ui/share-link';

interface Props {
  /** The river's canonical path, e.g. /rivers/missouri/current. */
  path: string;
  title: string;
  className?: string;
}

export default function ShareRiverButton({ path, title, className = '' }: Props) {
  const { status, share } = useShareLink();

  return (
    <>
      <button onClick={() => void share({ url: canonicalShareUrl(path), title })} className={className}>
        {status === 'copied' ? <Check className="w-4 h-4" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
        {status === 'idle' ? 'Share' : SHARE_LABEL[status]}
      </button>
      <ShareAnnouncement status={status} />
    </>
  );
}
