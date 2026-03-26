import { NextResponse } from 'next/server';
import { getX402Routes, X402_PAY_TO, X402_NETWORK, X402_FACILITATOR_URL } from '@/lib/x402-config';

export async function GET() {
  if (!X402_PAY_TO) {
    return NextResponse.json(
      { error: 'x402 payments not configured' },
      { status: 503 }
    );
  }

  const routes = getX402Routes();
  const routeSummary: Record<string, { price: string; description: string }> = {};
  for (const [path, config] of Object.entries(routes)) {
    routeSummary[path] = {
      price: config.price,
      description: config.config.description,
    };
  }

  return NextResponse.json({
    version: '1.0',
    protocol: 'x402',
    payTo: X402_PAY_TO,
    network: X402_NETWORK,
    currency: 'USDC',
    facilitator: X402_FACILITATOR_URL,
    routes: routeSummary,
  });
}
