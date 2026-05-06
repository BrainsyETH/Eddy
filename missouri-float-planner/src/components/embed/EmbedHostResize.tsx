'use client';

// src/components/embed/EmbedHostResize.tsx
// Host-side counterpart to EmbedAutoResize. Installs a single window listener
// that resizes any iframe[data-eddy-embed] on the page to match the height the
// embed posts via postMessage. Mount this once on any page that embeds Eddy
// widgets via iframe (e.g. blog posts that include embed iframes in their HTML).

import { useEffect } from 'react';

export default function EmbedHostResize() {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; height?: number } | null;
      if (!data || data.type !== 'eddy-embed:resize' || typeof data.height !== 'number') return;
      const frames = document.querySelectorAll<HTMLIFrameElement>('iframe[data-eddy-embed]');
      for (const frame of frames) {
        if (frame.contentWindow === e.source) {
          frame.style.height = `${data.height}px`;
          break;
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return null;
}
