import type { Metadata } from 'next';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import MOSurfaceWaterApp from '@/components/mo-surface-water/MOSurfaceWaterApp';

export const metadata: Metadata = publicPageMetadata(
  'Ozarks River Conditions Map',
  'Eddy-rated float conditions for curated Ozarks rivers, with flow and stage, station details, river forecasts, and 30-day trends.',
  '/river-map/ozarks',
  SHARE_IMAGES.gauge,
);

// Bypass static generation; the live USGS feed is the point.
export const dynamic = 'force-dynamic';

// The curated Ozarks observatory (formerly /river-map). Eddy's float
// verdicts live here, scoped to rated rivers; the national map at /river-map
// never issues them for an unrated gauge.
export default function OzarksRiverMapPage() {
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
