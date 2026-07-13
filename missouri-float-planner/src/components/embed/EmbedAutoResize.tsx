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

    // The widget's own root element (the child of <main id="main-content">).
    const widgetRoot = () =>
      document.getElementById('main-content')?.firstElementChild ?? null;

    const post = () => {
      // Report the body's own content height. Do NOT use
      // documentElement.scrollHeight: when the content is shorter than the
      // iframe's current viewport it inflates to that viewport height, so the
      // iframe latches tall and leaves dead space below the widget. The body
      // wraps the widget with no margin/padding, so its scrollHeight is the
      // true content height and shrinks back correctly.
      const height = document.body
        ? document.body.scrollHeight
        : document.documentElement.scrollHeight;

      // Compact, shrink-to-fit widgets (the condition badge) render their root
      // as inline-block. For those, also report the content width so the host
      // can hug the pill instead of leaving a gap on the right. Full-width
      // widgets render as block/flex and never post a width, so they keep
      // their responsive width:100%.
      const root = widgetRoot();
      const fitsWidth = root ? getComputedStyle(root).display === 'inline-block' : false;
      const width = fitsWidth ? Math.ceil(root!.getBoundingClientRect().width) : undefined;

      window.parent.postMessage(
        width ? { type: 'eddy-embed:resize', height, width } : { type: 'eddy-embed:resize', height },
        '*',
      );
    };

    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    const root = widgetRoot();
    if (root) ro.observe(root);

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
