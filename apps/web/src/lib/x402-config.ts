// x402 AI Agent Payment Configuration
// Defines which routes require payment and pricing for AI agent access

import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from 'x402-next';

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

const facilitatorConfig = { url: X402_FACILITATOR_URL as `${string}://${string}` };

/**
 * Wrap an API route handler with x402 payment enforcement for AI agents.
 * Regular browser users pass through freely. AI agents must pay via x402.
 * Supports both simple routes (request only) and dynamic routes (request + params context).
 */
export function withX402Route<C = undefined>(
  handler: C extends undefined
    ? (request: NextRequest) => Promise<NextResponse>
    : (request: NextRequest, context: C) => Promise<NextResponse>,
  price: string,
  description: string,
) {
  if (!X402_PAY_TO) {
    // x402 not configured - return handler as-is
    return handler;
  }

  const routeConfig = {
    price,
    network: X402_NETWORK,
    config: { description },
  };

  return async function x402Handler(request: NextRequest, context: C): Promise<NextResponse> {
    if (isAiAgent(request.headers.get('user-agent'))) {
      // AI agent detected - enforce x402 payment
      // Capture context (params) via closure so withX402 can call the original handler
      const wrapped = withX402(
        (req: NextRequest) => (handler as (req: NextRequest, ctx: C) => Promise<NextResponse>)(req, context),
        X402_PAY_TO as `0x${string}`,
        routeConfig,
        facilitatorConfig,
      );
      return wrapped(request) as Promise<NextResponse>;
    }

    // Regular user - pass through directly
    return (handler as (req: NextRequest, ctx: C) => Promise<NextResponse>)(request, context);
  };
}

// Route pricing for middleware-level protection (content pages only)
export function getContentPageRoutes() {
  return {
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
