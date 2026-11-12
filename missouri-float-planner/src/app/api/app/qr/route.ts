import QRCode from 'qrcode';
import { appLandingContext, appLandingUrl } from '@/lib/app-discovery';

/** Bounded, first-party destinations only; no arbitrary URL QR service. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.toString().length > 512 || [...query.keys()].some(key => query.getAll(key).length > 1)) {
    return new Response('Invalid app destination', { status: 400 });
  }
  const { dam, destination, campaign } = appLandingContext(Object.fromEntries(query));
  if (!dam && !destination) return new Response('Invalid app destination', { status: 400 });
  // Phone handoffs always use the canonical site, including on previews. A scan
  // therefore cannot verify preview-only code or a plan saved in a test database.
  const href = `https://eddy.guide${appLandingUrl(campaign, dam?.id, destination)}`;
  const svg = await QRCode.toString(href, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
  return new Response(svg, { headers: {
    'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  } });
}
