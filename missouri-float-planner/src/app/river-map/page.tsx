import type { Metadata } from 'next';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import NationalRiverMap from '@/components/national-map/NationalRiverMap';
import styles from '@/components/national-map/national-map.module.css';

export const metadata: Metadata = publicPageMetadata(
  'Live River Map',
  'Live river conditions across all 50 states: USGS streamflow compared with usual for the time of year and official NWS flood status, with a text-free fullscreen display.',
  '/river-map',
  SHARE_IMAGES.gauge,
);

// Bypass static generation; the live frame is the point.
export const dynamic = 'force-dynamic';

export default function RiverMapPage() {
  // Height tracks the VISIBLE viewport (dvh), so the mobile sheet stays clear
  // of the area under the iOS URL bar.
  return (
    <div className={`fixed inset-x-0 top-14 ${styles.pageFrame}`} style={{ height: 'calc(100dvh - 3.5rem)' }}>
      <NationalRiverMap />
    </div>
  );
}
