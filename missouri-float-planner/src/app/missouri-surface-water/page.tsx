import type { Metadata } from 'next';
import MOSurfaceWaterApp from '@/components/mo-surface-water/MOSurfaceWaterApp';

export const metadata: Metadata = {
  title: 'USGS Missouri Surface Water — Eddy',
  description:
    'Live statewide surface-water instrument for Missouri: every active USGS NWIS gauge, percentile-painted reaches, animated flow on rising rivers, gauge detail, and a 30-day time scrubber.',
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
