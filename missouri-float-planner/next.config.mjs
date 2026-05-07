/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'openweathermap.org',
        pathname: '/img/**',
      },
      {
        protocol: 'https',
        hostname: 'www.nps.gov',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  async redirects() {
    // /rivers/<slug>(?putIn=…&takeOut=…) → /plan?river=<slug>(&putIn=…&takeOut=…)
    // The per-river guide page is gone; the unified planner is canonical.
    // permanent: true emits 308 (Google treats it as permanent for ranking
    // transfer). Query params not named in the destination are forwarded.
    return [
      {
        source: '/rivers/:slug',
        destination: '/plan?river=:slug',
        permanent: true,
      },
    ];
  },
  async headers() {
    const sharedSecurityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self)',
      },
    ];

    const cspBase = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.blob.vercel-storage.com https://openweathermap.org https://www.nps.gov https://images.unsplash.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://tiles.openfreemap.org",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://waterservices.usgs.gov https://tilecache.rainviewer.com https://api.rainviewer.com https://www.googletagmanager.com https://tiles.openfreemap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com",
      "worker-src 'self' blob:",
      "font-src 'self' https://fonts.gstatic.com",
    ];

    return [
      // Embed routes — allow iframing from any origin
      {
        source: '/embed/:path*',
        headers: [
          ...sharedSecurityHeaders,
          {
            key: 'Content-Security-Policy',
            value: [...cspBase, "frame-ancestors *"].join('; '),
          },
        ],
      },
      // All other routes — deny iframing
      {
        source: '/((?!embed/).*)',
        headers: [
          ...sharedSecurityHeaders,
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: [...cspBase, "frame-ancestors 'none'"].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
