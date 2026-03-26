import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Regular search engines - allowed as before
      {
        userAgent: '*',
        allow: ['/', '/api/og/'],
        disallow: ['/admin', '/api/', '/embed/', '/simple'],
      },
      // AI crawlers - blocked from free crawling (must use x402 payment protocol)
      {
        userAgent: 'GPTBot',
        disallow: ['/'],
      },
      {
        userAgent: 'ChatGPT-User',
        disallow: ['/'],
      },
      {
        userAgent: 'ClaudeBot',
        disallow: ['/'],
      },
      {
        userAgent: 'CCBot',
        disallow: ['/'],
      },
      {
        userAgent: 'Google-Extended',
        disallow: ['/'],
      },
      {
        userAgent: 'Bytespider',
        disallow: ['/'],
      },
      {
        userAgent: 'Amazonbot',
        disallow: ['/'],
      },
      {
        userAgent: 'PerplexityBot',
        disallow: ['/'],
      },
      {
        userAgent: 'Applebot-Extended',
        disallow: ['/'],
      },
      {
        userAgent: 'FacebookBot',
        disallow: ['/'],
      },
      {
        userAgent: 'Diffbot',
        disallow: ['/'],
      },
      {
        userAgent: 'Cohere-ai',
        disallow: ['/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
