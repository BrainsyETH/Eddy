import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/og/'],
      disallow: ['/admin', '/api/', '/embed/', '/simple'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
