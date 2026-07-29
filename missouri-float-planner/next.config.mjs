import { withSentryConfig } from '@sentry/nextjs';

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
      {
        // Community-submitted river visual photos live in Supabase Storage.
        // Wildcard host so dev/preview/prod projects (different subdomains) all
        // resolve; scoped to the public storage path only.
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Universal links. A REWRITE, never a redirect: Apple's CDN does not
        // follow redirects when fetching this file, and a 3xx here breaks
        // universal links with nothing failing anywhere that anyone would see.
        //
        // Kept out of public/ because the path has no file extension, so a
        // static host serves it as application/octet-stream and iOS silently
        // ignores it. The route handler sets application/json explicitly.
        source: '/.well-known/apple-app-site-association',
        destination: '/api/apple-app-site-association',
      },
    ];
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

    // 'unsafe-eval' is required only by the Next.js dev runtime (react-refresh
    // uses eval); production ships without it so an injected string can never
    // reach eval/Function. 'unsafe-inline' remains for the GTM bootstrap and
    // Next's inline hydration scripts — replacing it with nonces/hashes is the
    // remaining CSP hardening step (audit F12).
    const isDev = process.env.NODE_ENV === 'development';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com"
      : "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com";

    const cspBase = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      // No plugin content, no <base> retargeting, and forms may only submit to
      // this origin (all app forms submit via fetch/onSubmit anyway).
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Access-point imagery is hot-linked from a broad, growing set of external
      // hosts (mdc.mo.gov, cdn.recreation.gov, fs.usda.gov, mostateparks.com,
      // private outfitter domains, …) rather than self-hosted. Enumerating every
      // host is brittle — a new river's source would silently fail to render — so
      // img-src allows any HTTPS origin. This is images only; script-src,
      // connect-src, etc. remain locked to explicit allowlists above/below.
      "img-src 'self' data: blob: https:",
      // Sentry's ingest host is in this list because a browser SDK that cannot
      // POST is indistinguishable from one that was never configured — the CSP
      // would have blocked every event silently, and the dashboard would have
      // stayed empty for a reason nobody would think to look for here.
      //
      // Wildcarded on purpose: the ingest subdomain encodes the Sentry org id
      // (o<id>.ingest.us.sentry.io), which is not knowable from this file and
      // would otherwise have to be duplicated wherever the DSN is set.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://waterservices.usgs.gov https://tilecache.rainviewer.com https://api.rainviewer.com https://www.googletagmanager.com https://tiles.openfreemap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.tile.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
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

// ── withSentryConfig ────────────────────────────────────────────────────────
//
// Two jobs, and neither is initialising the SDK (instrumentation.ts and
// instrumentation-client.ts do that):
//
//   1. SOURCE MAPS. Without them every stack trace — server and browser alike —
//      points at minified output, which is the difference between an issue you
//      can act on and one you can only count.
//
//   2. Tree-shaking the SDK's debug logging out of the production bundle.
//
// ── Why it is safe on a deployment with no Sentry ──────────────────────────
//
// Uploading needs SENTRY_AUTH_TOKEN, a WRITE credential that must never be
// NEXT_PUBLIC_ and is not set in preview or locally. `sourcemaps.disable` is
// keyed off its presence rather than left to fail at build time: a missing
// token would otherwise turn every build without Sentry into a warning-noisy
// one, and a build step that cries wolf is a build step people stop reading.
//
// `silent` follows the same env, so the only builds that say anything about
// Sentry are the ones actually talking to it.
const hasSentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !hasSentryUpload,
  sourcemaps: {
    disable: !hasSentryUpload,
    // Upload them, then delete them from the deployed output. Leaving them
    // served publicly would hand the whole unminified source tree to anyone who
    // asked, which is a strictly worse trade than the readable traces are worth.
    deleteSourcemapsAfterUpload: true,
  },

  webpack: {
    treeshake: {
      // Strips Sentry's own debug logging from the client bundle. (The
      // top-level `disableLogger` that most guides still show is deprecated in
      // v10 and warns on every build.)
      //
      // `removeTracing: true` is also available and would be honest here, since
      // both SDKs run tracesSampleRate 0 — left off until someone can run a
      // full `next build` against real env and confirm the bundle, because a
      // tree-shaking flag is exactly the kind of thing that is fine until it
      // is not.
      removeDebugLogging: true,
    },
  },

  // NOT ENABLED, deliberately: the tunnel route proxies events through this
  // app's own origin to dodge ad blockers. It would also make every browser
  // error a same-origin POST that bypasses the connect-src entry added above,
  // route unbounded third-party payloads through our server, and defeat the
  // Vercel edge cache on a path under our control. If ad blockers turn out to
  // cost a meaningful share of events, revisit with those costs in view.
  // tunnelRoute: '/monitoring',
});
