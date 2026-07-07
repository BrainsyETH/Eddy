import type { Metadata } from 'next';
import MOSurfaceWaterApp from '@/components/mo-surface-water/MOSurfaceWaterApp';

export const metadata: Metadata = {
  title: 'Live River Map — Eddy',
  description:
    'Missouri float water, live: every curated river painted by its USGS gauges with animated flow, a data dock with the statewide floater’s verdict and 30-day trends, gauge detail, forecast-aware flood warnings, and a drag-to-replay month timeline.',
};

// Bypass static generation; the live USGS feed is the point.
export const dynamic = 'force-dynamic';

export default function MissouriSurfaceWaterPage() {
  // Height tracks the VISIBLE viewport (dvh), not the layout viewport, so the
  // timeline / bottom sheet stay clear of the area under the iOS URL bar.
  return (
    <div
      className="fixed inset-x-0 top-14"
      style={{ height: 'calc(100dvh - 3.5rem)' }}
    >
      <MOSurfaceWaterApp />
    </div>
  );
}
