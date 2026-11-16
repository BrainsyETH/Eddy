'use client';

// src/components/ui/share-link.tsx
// Button-side state for src/lib/share-link.ts: a short-lived "copied" or
// "couldn't copy" status, and the screen-reader announcement that goes with it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { shareOrCopy, type ShareLink, type ShareOutcome } from '@/lib/share-link';

/** What a share button shows after a copy. A completed or cancelled sheet shows nothing. */
export type ShareStatus = 'idle' | 'copied' | 'failed';

export const SHARE_LABEL: Record<Exclude<ShareStatus, 'idle'>, string> = {
  copied: 'Copied!',
  failed: 'Couldn’t copy',
};

const ANNOUNCEMENT: Record<ShareStatus, string> = {
  idle: '',
  copied: 'Link copied',
  failed: 'Couldn’t copy the link',
};

export function useShareLink(resetAfterMs = 2000) {
  const [status, setStatus] = useState<ShareStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const share = useCallback(async (link: ShareLink): Promise<ShareOutcome> => {
    const outcome = await shareOrCopy(link);
    if (outcome === 'copied' || outcome === 'failed') {
      if (timer.current) clearTimeout(timer.current);
      setStatus(outcome);
      timer.current = setTimeout(() => setStatus('idle'), resetAfterMs);
    }
    return outcome;
  }, [resetAfterMs]);

  return { status, share };
}

/**
 * Says the result aloud. Always mounted: a live region that appears together
 * with its text is skipped by some screen readers.
 */
export function ShareAnnouncement({ status }: { status: ShareStatus }) {
  return <span className="sr-only" role="status">{ANNOUNCEMENT[status]}</span>;
}
