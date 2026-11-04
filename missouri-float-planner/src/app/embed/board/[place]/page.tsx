import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import HomeBaseBoard from '@/components/display/HomeBaseBoard';
import { appQrImage } from '@/lib/app-qr';
import { homeBaseFor, riverPageUrl } from '@/lib/display/home-base';

// A partner's wall display (docs/home-base-board.md). Not a page to be found
// by search; it is opened full screen on one screen at one place.

type Params = { params: Promise<{ place: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const config = homeBaseFor((await params).place);
  return {
    title: config ? `${config.name} · River board` : 'River board',
    robots: { index: false, follow: false },
  };
}

export default async function HomeBaseBoardPage({ params }: Params) {
  const config = homeBaseFor((await params).place);
  if (!config) notFound();

  // QR codes are drawn here so no QR library ships to the wall (as /app and
  // /river-map do). River pages carry Apple's Smart App Banner, so an iPhone
  // scan offers Open in the Eddy app, or Get from the App Store.
  const riverQrs = Object.fromEntries(
    await Promise.all(
      config.rivers.map(async ({ slug }) => {
        const href = riverPageUrl(config, slug);
        const svg = await QRCode.toString(href, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
        return [slug, { href, src: `data:image/svg+xml,${encodeURIComponent(svg)}` }] as const;
      })
    )
  );
  const appQr = await appQrImage(config.campaign, undefined, { margin: 1 });

  return <HomeBaseBoard boardId={config.id} riverQrs={riverQrs} appQr={appQr} />;
}
