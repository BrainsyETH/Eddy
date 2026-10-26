import QRCode from 'qrcode';
import { appLandingUrl } from './app-discovery';

/** Server-rendered image: no QR library or external QR service in the browser. */
export async function appQrImage(campaign: string | null, damId: string) {
  const href = `https://eddy.guide${appLandingUrl(campaign, damId)}`;
  const svg = await QRCode.toString(href, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
  return { href, src: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}
