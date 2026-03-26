// x402 AI Agent Payment Configuration
// Defines which routes require payment and pricing for AI agent access

export const X402_PAY_TO = process.env.X402_WALLET_ADDRESS || '';
export const X402_NETWORK = 'base' as const;
export const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';

// Known AI agent User-Agent patterns
export const AI_AGENT_PATTERNS = [
  'GPTBot',
  'ChatGPT-User',
  'Google-Extended',
  'Anthropic',
  'ClaudeBot',
  'CCBot',
  'Bytespider',
  'Applebot-Extended',
  'FacebookBot',
  'PerplexityBot',
  'Amazonbot',
  'AI2Bot',
  'Diffbot',
  'Omgilibot',
  'YouBot',
  'Cohere-ai',
];

export function isAiAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return AI_AGENT_PATTERNS.some(pattern =>
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
}

// Route pricing configuration for x402
// Format expected by x402-next paymentMiddleware
export function getX402Routes() {
  return {
    // Public API routes
    '/api/rivers/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'River data access' },
    },
    '/api/gauges/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'Gauge readings access' },
    },
    '/api/conditions/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'River conditions data' },
    },
    '/api/weather/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'Weather data access' },
    },
    '/api/blog/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'Blog content access' },
    },
    '/api/plan/:path*': {
      price: '$0.002',
      network: X402_NETWORK,
      config: { description: 'Float plan data' },
    },
    // Content pages (HTML scraping by AI crawlers)
    '/rivers/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'River page content' },
    },
    '/blog/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'Blog page content' },
    },
    '/gauges/:path*': {
      price: '$0.001',
      network: X402_NETWORK,
      config: { description: 'Gauge page content' },
    },
  } as const;
}
