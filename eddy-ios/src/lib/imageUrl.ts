/** Match the website's restricted image optimizer; unknown hosts keep their URL. */
export function imageUrl(uri: string, width: number, origin = 'https://eddy.guide'): string {
  try {
    const url = new URL(uri, origin);
    // First-party place photos use the same resized copies as the website.
    const localPhoto = url.origin === new URL(origin).origin && url.pathname.startsWith('/lakes/');
    const allowed = url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      localPhoto ||
      (url.hostname === 'cdn.recreation.gov' && url.pathname.startsWith('/public/')) ||
      (url.hostname === 'icampmo.usedirect.com' && url.pathname.startsWith('/MSPWeb/images/Missouri/')) ||
      url.hostname === 'www.nps.gov' || url.hostname === 'images.unsplash.com' ||
      (url.hostname === 'upload.wikimedia.org' && url.pathname.startsWith('/wikipedia/commons/')) ||
      (url.hostname === 'www.fws.gov' && url.pathname.startsWith('/sites/default/files/')) ||
      url.hostname === 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com' ||
      (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'))
    );
    if (!allowed) return uri;
    // Standard Next image widths. These include device pixels, not layout points.
    const sizes = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920];
    const pixels = Number.isFinite(width) ? Math.max(1, width) : 640;
    const size = sizes.find((n) => n >= pixels) ?? 1920;
    return `${origin.replace(/\/$/, '')}/_next/image?url=${encodeURIComponent(localPhoto ? url.pathname : url.href)}&w=${size}&q=75`;
  } catch {
    return uri;
  }
}
