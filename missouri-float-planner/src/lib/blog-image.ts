/** Guide/access scenery also comes from agency and outfitter hosts outside
 * Next's restricted optimizer. Render those URLs directly, like the blog index,
 * rather than generating a broken /_next/image request or widening the proxy. */
export function optimizeBlogImage(src: string): boolean {
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return ['q5skne5bn5nbyxfw.public.blob.vercel-storage.com', 'www.nps.gov', 'images.unsplash.com'].includes(url.hostname)
      || (url.hostname === 'upload.wikimedia.org' && url.pathname.startsWith('/wikipedia/commons/'))
      || (url.hostname === 'cdn.recreation.gov' && url.pathname.startsWith('/public/'))
      || (url.hostname === 'icampmo.usedirect.com' && url.pathname.startsWith('/MSPWeb/images/Missouri/'))
      || (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'));
  } catch { return false; }
}
