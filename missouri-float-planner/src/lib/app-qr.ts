import QRCode from 'qrcode';
import { appStoreUrl } from './app-discovery';

/** QR codes encode the App Store listing (with campaign), so a scan is one step from install. */
export async function appQrSvg(campaign: string | null, { margin = 4 }: { margin?: number } = {}) {
  const href = appStoreUrl(campaign);
  return { href, svg: await QRCode.toString(href, { type: 'svg', errorCorrectionLevel: 'M', margin }) };
}

/** Server-rendered image: no QR library or external QR service in the browser. */
export async function appQrImage(campaign: string | null, { margin = 4 }: { margin?: number } = {}) {
  const { href, svg } = await appQrSvg(campaign, { margin });
  return { href, src: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}
