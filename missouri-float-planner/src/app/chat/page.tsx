'use client';

// src/app/chat/page.tsx
// Dedicated chat page for Eddy — full-screen chat experience.
// Accepts ?river=<slug> URL param to pre-load river context.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatPanel from '@/components/chat/ChatPanel';

function ChatPageInner() {
  const searchParams = useSearchParams();
  const riverSlug = searchParams.get('river') || undefined;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <ChatPanel riverSlug={riverSlug} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}>
        <p className="text-neutral-400">Loading chat...</p>
      </div>
    }>
      <ChatPageInner />
    </Suspense>
  );
}
