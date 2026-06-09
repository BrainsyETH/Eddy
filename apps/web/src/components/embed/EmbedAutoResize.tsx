'use client';

// src/components/embed/EmbedAutoResize.tsx
// Posts the document content height to the parent window so embedding sites
// can size the iframe to its content (no fixed-height clipping or whitespace).
//
// The host listener (shipped in /embed snippets) matches by event.source and
// updates the iframe height. See src/app/embed/page.tsx for the snippet.

import { useEffect } from 'react';

export default function EmbedAutoResize() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;

    const post = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      window.parent.postMessage({ type: 'eddy-embed:resize', height }, '*');
    };

    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    window.addEventListener('load', post);
    window.addEventListener('resize', post);

    return () => {
      ro.disconnect();
      window.removeEventListener('load', post);
      window.removeEventListener('resize', post);
    };
  }, []);

  return null;
}
