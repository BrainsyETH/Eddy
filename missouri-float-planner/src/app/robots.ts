import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// The parts of /api/ that are free for anyone to fetch: share images, the
// OpenAPI description, the dataset export and the MCP endpoint. /llms.txt
// points agents at the last three, so they must stay crawlable; a test keeps
// the two files in agreement. The rest of /api/ is JSON for the apps and the
// REST API, which is not content to index.
export const CRAWLABLE_API_PATHS = [
  '/api/og/',
  '/api/openapi.json',
  '/api/export/rivers.json',
  '/api/mcp',
];

export default function robots(): MetadataRoute.Robots {
  return {
    // One group on purpose. A crawler that matches a group naming it ignores
    // `*` entirely, so per-bot groups have to repeat every rule and drift when
    // one is missed. Search engines and AI crawlers get the same access.
    //
    // The trailing slash in '/embed/' is load-bearing: it blocks the widget
    // iframes (/embed/widget/..., /embed/card/..., etc.) while the /embed
    // marketing/configurator page itself stays crawlable and is listed in the
    // sitemap.
    rules: [
      {
        userAgent: '*',
        allow: ['/', ...CRAWLABLE_API_PATHS],
        disallow: ['/admin', '/api/', '/embed/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
