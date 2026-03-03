'use client';

// Client component that redirects to the gauges dashboard with the gauge expanded.
// The server-rendered page.tsx serves the metadata + OG image tags for social crawlers,
// then this component handles the redirect for real users.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GaugeRedirect({ siteId }: { siteId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/gauges?gauge=${siteId}`);
  }, [router, siteId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-neutral-300 border-t-primary-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-500 text-sm">Loading gauge station...</p>
      </div>
    </div>
  );
}
