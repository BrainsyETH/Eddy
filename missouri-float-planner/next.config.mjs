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
    // Old per-river share URLs (/rivers/<slug>?putIn=…&takeOut=…) point at the
    // unified planner now. permanent: true emits 308 (treated as permanent by
    // search engines, equivalent to 301 for ranking transfer). Query params
    // not in destination are forwarded automatically.
    return [
      // River Reports consolidated from /gauges onto the canonical /rivers index.
      {
        source: '/gauges',
        destination: '/rivers',
        permanent: true,
      },
      // The statewide observatory shipped as /missouri-surface-water and was
      // renamed to the region-agnostic /river-map (multi-region is coming).
      {
        source: '/missouri-surface-water',
        destination: '/river-map',
        permanent: true,
      },
      {
        source: '/rivers/:slug',
        has: [{ type: 'query', key: 'putIn' }],
        destination: '/plan?river=:slug',
        permanent: true,
      },
      {
        source: '/rivers/:slug',
        has: [{ type: 'query', key: 'takeOut' }],
        destination: '/plan?river=:slug',
        permanent: true,
      },
      // Same for canonical /rivers/<state>/<slug> share URLs.
      {
        source: '/rivers/:state/:slug',
        has: [{ type: 'query', key: 'putIn' }],
        destination: '/plan?river=:slug',
        permanent: true,
      },
      {
        source: '/rivers/:state/:slug',
        has: [{ type: 'query', key: 'takeOut' }],
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
      // Access-point imagery is hot-linked from a broad, growing set of external
      // hosts (mdc.mo.gov, cdn.recreation.gov, fs.usda.gov, mostateparks.com,
      // private outfitter domains, …) rather than self-hosted. Enumerating every
      // host is brittle — a new river's source would silently fail to render — so
      // img-src allows any HTTPS origin. This is images only; script-src,
      // connect-src, etc. remain locked to explicit allowlists above/below.
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://waterservices.usgs.gov https://tilecache.rainviewer.com https://api.rainviewer.com https://www.googletagmanager.com https://tiles.openfreemap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.tile.openstreetmap.org",
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
