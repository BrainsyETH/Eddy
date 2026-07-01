'use client';

// src/components/ui/OfflineBanner.tsx
// Slim banner shown when the browser goes offline. The stated primary user is
// often on poor rural signal, so we surface a clear "data may be stale" notice
// rather than failing silently. Renders nothing while online.

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const update = () => setIsOffline(!navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950 text-xs sm:text-sm font-medium px-4 py-1.5 flex items-center justify-center gap-2 shadow-md"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>You&apos;re offline — showing last-loaded data. Conditions may be out of date.</span>
    </div>
  );
}
