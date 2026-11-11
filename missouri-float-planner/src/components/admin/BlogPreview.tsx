'use client';
import { useEffect, useRef, useState } from 'react';
export default function BlogPreview({
  post,
  label = 'Unsaved preview',
  onClose,
}: {
  post: Record<string, unknown>;
  label?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const receive = (e: MessageEvent) => {
      if (
        e.origin === location.origin &&
        e.source === frame.current?.contentWindow &&
        e.data?.type === 'eddy-blog-preview-ready'
      )
        frame.current?.contentWindow?.postMessage(
          { type: 'eddy-blog-preview', post },
          location.origin,
        );
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [post]);
  return (
    <dialog
      ref={dialog}
      aria-label="Post preview"
      onCancel={onClose}
      className="admin-preview"
    >
      <header>
        <strong>{label}</strong>
        <div>
          <button onClick={() => setMobile(false)} aria-pressed={!mobile}>
            Desktop
          </button>
          <button onClick={() => setMobile(true)} aria-pressed={mobile}>
            Mobile
          </button>
          <button onClick={onClose}>Close preview</button>
        </div>
      </header>
      <iframe
        ref={frame}
        title="Post preview"
        src="/admin/blog/preview"
        style={{
          width: mobile ? '390px' : '100%',
          maxWidth: '100%',
          height: '100%',
          margin: 'auto',
          display: 'block',
          border: 0,
        }}
      />
    </dialog>
  );
}
