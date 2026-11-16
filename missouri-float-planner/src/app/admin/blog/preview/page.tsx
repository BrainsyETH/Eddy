'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { renderBlogPreview } from './action';
export default function PreviewPage() {
  const [content, setContent] = useState<ReactNode>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let version = 0;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== parent ||
        event.data?.type !== 'eddy-blog-preview'
      )
        return;
      const current = ++version;
      void renderBlogPreview(event.data.post)
        .then((node) => {
          if (current === version) setContent(node);
        })
        .catch(() =>
          setError('Preview could not load. Close this preview and try again.'),
        );
    };
    window.addEventListener('message', receive);
    parent.postMessage({ type: 'eddy-blog-preview-ready' }, location.origin);
    return () => {
      version++;
      window.removeEventListener('message', receive);
    };
  }, []);
  return error ? (
    <p role="alert" className="p-6">
      {error}
    </p>
  ) : (
    (content ?? <p className="p-6">Loading preview…</p>)
  );
}
