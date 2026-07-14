import { NextResponse } from 'next/server';
import {
  X402_ENABLED,
  X402_VERSION,
  X402_NETWORKS,
  X402_ROUTES,
  X402_FACILITATOR_LABEL,
  X402_BAZAAR_ACTIVE,
} from '@/lib/x402-config';

// x402 discovery manifest (V2).
//
// The per-route price table is generated from the single-source X402_ROUTES map
// in src/lib/x402/config.ts, so advertised prices can never drift from the
// prices actually enforced on each route. Note that in x402 V2, canonical price
// discovery is the live 402 response (PaymentRequirements `accepts`) and the
// Bazaar discovery layer; this manifest is a convenience index.

export async function GET() {
  if (!X402_ENABLED) {
    return NextResponse.json({ error: 'x402 payments not configured' }, { status: 503 });
  }

  const routes = Object.fromEntries(
    Object.entries(X402_ROUTES).map(([path, meta]) => [
      path,
      { price: meta.price, description: meta.description },
    ]),
  );

  return NextResponse.json(
    {
      x402Version: X402_VERSION,
      protocol: 'x402',
      currency: 'USDC',
      // Multi-chain: one entry per configured chain, each with its payout address.
      networks: X402_NETWORKS.map((n) => ({
        network: n.caip2,
        name: n.name,
        asset: n.asset,
        payTo: n.payTo,
      })),
      facilitator: X402_FACILITATOR_LABEL,
      discovery: {
        // Bazaar auto-indexes paid endpoints when settling through the Coinbase
        // CDP facilitator — no separate registration step.
        bazaar: X402_BAZAAR_ACTIVE,
        search: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/search',
      },
      scheme: 'exact',
      routes,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  );
}
