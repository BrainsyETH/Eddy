import { appLandingContext } from '@/lib/app-discovery';
import { appQrSvg } from '@/lib/app-qr';

/**
 * Bounded, first-party contexts only; no arbitrary URL QR service. The context
 * selects the campaign; the code itself opens the App Store listing, because a
 * phone scan should land on the install step rather than this site again.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.toString().length > 512 || [...query.keys()].some(key => query.getAll(key).length > 1)) {
    return new Response('Invalid app destination', { status: 400 });
  }
  const { dam, destination, campaign } = appLandingContext(Object.fromEntries(query));
  if (!dam && !destination) return new Response('Invalid app destination', { status: 400 });
  const { svg } = await appQrSvg(campaign);
  return new Response(svg, { headers: {
    'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  } });
}
