'use client';

import dynamic from 'next/dynamic';

// Keep Remotion out of the server render and other site routes.
const RiverWindow = dynamic(() => import('@/components/display/RiverWindow'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0b172b',
        color: '#f4ead5',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      Opening the river window…
    </div>
  ),
});

export default function DisplayPage() {
  return <RiverWindow />;
}
