import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'USGS Missouri Surface Water — Eddy',
  description:
    'Statewide USGS surface-water instrument for Missouri: percentile-painted reaches, animated flow, gauge detail, and a 30-day time scrubber.',
};

export default function MissouriSurfaceWaterPage() {
  return (
    <div className="fixed inset-0 top-14 bg-[#1F1A14]">
      <iframe
        src="/missouri-surface-water/index.html"
        title="USGS Missouri Surface Water"
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
