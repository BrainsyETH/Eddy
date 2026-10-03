/** Match the website's restricted image optimizer; unknown hosts keep their URL. */
export function imageUrl(uri: string, width: number, origin = 'https://eddy.guide'): string {
  try {
    const url = new URL(uri, origin);
    const allowed = url.protocol === 'https:' && (
      (url.hostname === 'cdn.recreation.gov' && url.pathname.startsWith('/public/')) ||
      (url.hostname === 'icampmo.usedirect.com' && url.pathname.startsWith('/MSPWeb/images/Missouri/')) ||
      url.hostname === 'www.nps.gov' || url.hostname === 'images.unsplash.com' ||
      url.hostname === 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com' ||
      (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'))
    );
    if (!allowed) return uri;
    // Standard Next image widths. These include device pixels, not layout points.
    const sizes = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920];
    const pixels = Number.isFinite(width) ? Math.max(1, width) : 640;
    const size = sizes.find((n) => n >= pixels) ?? 1920;
    return `${origin.replace(/\/$/, '')}/_next/image?url=${encodeURIComponent(url.href)}&w=${size}&q=75`;
  } catch {
    return uri;
  }
}
