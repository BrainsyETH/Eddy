import type { Metadata } from 'next';
import MOSurfaceWaterApp from '@/components/mo-surface-water/MOSurfaceWaterApp';

export const metadata: Metadata = {
  title: 'USGS Missouri Surface Water — Eddy',
  description:
    'A live, map-first portrait of Missouri float water: every curated river painted by its USGS gauges with animated flow, a data dock with the statewide floater’s verdict and 30-day trends, gauge detail, forecast-aware flood warnings, and a drag-to-replay month timeline.',
};

// Bypass static generation; the live USGS feed is the point.
export const dynamic = 'force-dynamic';

export default function MissouriSurfaceWaterPage() {
  return (
    <div className="fixed inset-0 top-14">
      <MOSurfaceWaterApp />
    </div>
  );
}
