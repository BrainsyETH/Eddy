// src/app/chat/page.tsx
// Chat feature is currently disabled while we optimize the experience.

import Image from 'next/image';
import Link from 'next/link';
import { EDDY_IMAGES } from '@/constants';

export default function ChatPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4" style={{ height: 'calc(100vh - 56px)' }}>
      <Image
        src={EDDY_IMAGES.favicon}
        alt="Eddy"
        width={64}
        height={64}
        className="w-16 h-16 rounded-full"
      />
      <h1
        className="text-2xl font-bold text-neutral-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Chat Coming Soon
      </h1>
      <p className="text-sm text-neutral-500 text-center max-w-sm">
        Eddy&apos;s chat is getting an upgrade. In the meantime, check river conditions and Eddy&apos;s reports on each river page.
      </p>
      <Link
        href="/rivers"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-lg transition-colors text-sm no-underline"
      >
        Explore Rivers
      </Link>
    </div>
  );
}
