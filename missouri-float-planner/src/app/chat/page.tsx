'use client';

// src/app/chat/page.tsx
// Dedicated chat page for Eddy — full-screen chat experience.
// Accepts ?river=<slug> URL param to pre-load river context.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import ChatPanel from '@/components/chat/ChatPanel';
import { EDDY_IMAGES } from '@/constants';

function ChatPageInner() {
  const searchParams = useSearchParams();
  const riverSlug = searchParams.get('river') || undefined;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Branded header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-primary-800 border-b border-primary-700">
        <Image
          src={EDDY_IMAGES.canoe}
          alt="Eddy"
          width={32}
          height={32}
          className="w-8 h-8 rounded-full border border-primary-600"
        />
        <div>
          <h1
            className="text-base font-semibold text-accent-400 leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Eddy
          </h1>
          {riverSlug && (
            <p className="text-[11px] text-primary-300 leading-tight">
              {riverSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </p>
          )}
        </div>
      </div>
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
