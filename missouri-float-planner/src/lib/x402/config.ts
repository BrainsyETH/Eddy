// x402 configuration — single source of truth for the AI-agent payment layer.
//
// Eddy speaks x402 V2 (https://x402.org). Payment verification and settlement
// are delegated to @x402/core@2.18; this module only holds the site-specific
// configuration: which wallet receives funds, which networks/facilitator to
// use, the per-route price table, and feature flags.
//
// The whole layer is DORMANT until a payout address is configured. When no
// wallet is set, `X402_ENABLED` is false and `withX402Route` returns handlers
// untouched, so nothing changes for browsers or agents.

import { SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2 } from '@x402/svm';
import { facilitator as coinbaseFacilitator } from '@coinbase/x402';
import type { FacilitatorConfig } from '@x402/core/server';
import type { Network, Price } from '@x402/core/types';
import type { PaymentOption, DynamicPayTo } from '@x402/core/http';

/** x402 protocol generation this integration targets. */
export const X402_VERSION = 2 as const;

const flag = (name: string): boolean => {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
};

// ---------------------------------------------------------------------------
// Networks (CAIP-2 identifiers)
// ---------------------------------------------------------------------------

/**
 * Testnet mode. When X402_TESTNET is set, Eddy prices on Base Sepolia / Solana
 * devnet instead of mainnet — pair with the public x402.org facilitator to
 * exercise the full flow without real funds. Mainnet (the default) requires the
 * Coinbase CDP facilitator, which supports Base mainnet settlement.
 */
export const X402_TESTNET = flag('X402_TESTNET');

/** Active EVM network — Base mainnet, or Base Sepolia in testnet mode. */
export const BASE_NETWORK: Network = X402_TESTNET ? 'eip155:84532' : 'eip155:8453';
/** Active SVM network — Solana mainnet, or devnet in testnet mode. */
export const SOLANA_NETWORK: Network = (X402_TESTNET ? SOLANA_DEVNET_CAIP2 : SOLANA_MAINNET_CAIP2) as Network;

// ---------------------------------------------------------------------------
// Payout addresses (per chain)
// ---------------------------------------------------------------------------

/** EVM payout address (Base). Master on/off switch for EVM acceptance. */
export const X402_PAY_TO = process.env.X402_WALLET_ADDRESS?.trim() || '';
/** Optional Solana payout address (base58). Enables the Solana accept option. */
export const X402_SOLANA_PAY_TO = process.env.X402_SOLANA_ADDRESS?.trim() || '';

/** True once at least one payout address is configured. */
export const X402_ENABLED = Boolean(X402_PAY_TO || X402_SOLANA_PAY_TO);

// ---------------------------------------------------------------------------
// Feature flags (all default OFF so the money path stays minimal by default)
// ---------------------------------------------------------------------------

/**
 * Wallet-based sessions (Sign-In-With-X, CAIP-122). When enabled, an agent that
 * has already paid for a resource can re-access it by presenting a SIWx proof
 * instead of paying again. Uses in-memory storage by default — see docs for the
 * persistent-storage caveat on serverless deployments.
 */
export const X402_SIWX_ENABLED = flag('X402_SIWX_ENABLED');

/**
 * Register the server-side Bazaar extension. Discovery also happens automatically
 * facilitator-side when settling through the Coinbase CDP facilitator; this flag
 * turns on the resource-server half of the Bazaar protocol.
 */
export const X402_BAZAAR_ENABLED = flag('X402_BAZAAR_ENABLED');

/**
 * Use a dynamic (per-request) payTo resolver instead of a static address.
 * Off by default; the resolver returns the configured wallet until Eddy defines
 * per-request revenue routing (see `resolveEvmPayTo`).
 */
export const X402_DYNAMIC_PAYTO_ENABLED = flag('X402_DYNAMIC_PAYTO');

// ---------------------------------------------------------------------------
// Facilitator
// ---------------------------------------------------------------------------

const X402_FACILITATOR_URL_ENV = process.env.X402_FACILITATOR_URL?.trim() || '';
const HAS_CDP_CREDS = Boolean(
  process.env.CDP_API_KEY_ID?.trim() && process.env.CDP_API_KEY_SECRET?.trim(),
);

/**
 * Resolve the facilitator that verifies/settles payments.
 *
 * Preference order:
 *   1. Coinbase CDP facilitator when CDP_API_KEY_ID/SECRET are present. This
 *      settles on mainnet AND auto-indexes Eddy's paid endpoints in the x402
 *      Bazaar discovery layer (no separate registration step).
 *   2. An explicit X402_FACILITATOR_URL (self-hosted or public).
 *   3. The public x402.org facilitator as a last-resort default (testnet-only).
 */
export function getFacilitatorConfig(): FacilitatorConfig {
  if (HAS_CDP_CREDS) return coinbaseFacilitator;
  if (X402_FACILITATOR_URL_ENV) return { url: X402_FACILITATOR_URL_ENV };
  return { url: 'https://x402.org/facilitator' };
}

/** Human-readable facilitator label for the discovery manifest. */
export const X402_FACILITATOR_LABEL = HAS_CDP_CREDS
  ? 'coinbase-cdp'
  : X402_FACILITATOR_URL_ENV || 'https://x402.org/facilitator';

/** Whether Bazaar discovery is active (CDP facilitator or explicit server ext). */
export const X402_BAZAAR_ACTIVE = HAS_CDP_CREDS || X402_BAZAAR_ENABLED;

// ---------------------------------------------------------------------------
// Route price table — SINGLE SOURCE OF TRUTH
// ---------------------------------------------------------------------------
//
// Every gated route references a key here (via `withX402Route`), and the
// /.well-known/x402 manifest is generated from this same map, so per-route
// prices and the advertised price table can never drift apart.

export interface X402RouteMeta {
  /** Price string parsed by the scheme (USD → USDC), e.g. "$0.005". */
  price: Price;
  /** Human description surfaced in the 402 response and discovery metadata. */
  description: string;
}

export const X402_ROUTES = {
  '/api/rivers': { price: '$0.005', description: 'River data access' },
  '/api/rivers/:slug': { price: '$0.005', description: 'River detail data' },
  '/api/rivers/:slug/access-points': { price: '$0.005', description: 'River access points data' },
  '/api/rivers/:slug/access/:accessSlug': { price: '$0.005', description: 'Access point detail data' },
  '/api/rivers/:slug/pois': { price: '$0.01', description: 'River points of interest data' },
  '/api/rivers/:slug/hazards': { price: '$0.01', description: 'River hazards data' },
  '/api/rivers/:slug/services': { price: '$0.01', description: 'River services data' },
  '/api/gauges': { price: '$0.001', description: 'Gauge stations data' },
  '/api/gauges/:siteId/history': { price: '$0.005', description: 'Gauge history data' },
  '/api/gauge-thresholds': { price: '$0.001', description: 'Gauge thresholds data' },
  '/api/vessel-types': { price: '$0.001', description: 'Vessel types data' },
  '/api/conditions/:riverId': { price: '$0.01', description: 'River conditions data' },
  '/api/weather': { price: '$0.01', description: 'Weather data' },
  '/api/weather/:riverSlug': { price: '$0.01', description: 'River weather data' },
  '/api/weather/:riverSlug/forecast': { price: '$0.01', description: 'Weather forecast data' },
  '/api/blog': { price: '$0.005', description: 'Blog posts data' },
  '/api/blog/:slug': { price: '$0.005', description: 'Blog post data' },
  '/api/chat': { price: '$0.02', description: 'AI chat access' },
  '/api/plan': { price: '$0.02', description: 'Float plan data' },
  '/api/plan/campgrounds': { price: '$0.01', description: 'Campgrounds data' },
  '/api/shuttle': { price: '$0.01', description: 'Shuttle distance data' },
  '/api/eddy-update/:riverSlug': { price: '$0.01', description: 'Eddy update data' },
  '/api/eddy-updates': { price: '$0.01', description: 'Eddy updates (all rivers)' },
} as const satisfies Record<string, X402RouteMeta>;

export type X402RouteKey = keyof typeof X402_ROUTES;

/** Networks Eddy currently advertises, for the discovery manifest. */
export const X402_NETWORKS = [
  ...(X402_PAY_TO
    ? [{ caip2: BASE_NETWORK, name: X402_TESTNET ? 'Base Sepolia' : 'Base', asset: 'USDC', payTo: X402_PAY_TO }]
    : []),
  ...(X402_SOLANA_PAY_TO
    ? [{ caip2: SOLANA_NETWORK, name: X402_TESTNET ? 'Solana Devnet' : 'Solana', asset: 'USDC', payTo: X402_SOLANA_PAY_TO }]
    : []),
] as const;

// ---------------------------------------------------------------------------
// payTo resolution (supports the dynamic-payTo capability)
// ---------------------------------------------------------------------------

/**
 * Resolve the EVM payout target. Returns a static address by default. When
 * X402_DYNAMIC_PAYTO is enabled, returns a server-side resolver — the extension
 * point for per-request revenue routing (e.g. splitting to partners by path).
 * The resolver is server-decided; the client never chooses the recipient.
 */
export function resolveEvmPayTo(): string | DynamicPayTo {
  if (!X402_DYNAMIC_PAYTO_ENABLED) return X402_PAY_TO;
  return () => X402_PAY_TO; // TODO: route by context.path / partner when defined
}

/**
 * Build the `accepts` payment options for a route at a given price. Includes an
 * option per configured chain (Base and/or Solana) so paying agents can choose.
 */
export function buildAccepts(price: Price): PaymentOption[] {
  const accepts: PaymentOption[] = [];
  if (X402_PAY_TO) {
    accepts.push({
      scheme: 'exact',
      network: BASE_NETWORK,
      payTo: resolveEvmPayTo(),
      price,
      maxTimeoutSeconds: 60,
    });
  }
  if (X402_SOLANA_PAY_TO) {
    accepts.push({
      scheme: 'exact',
      network: SOLANA_NETWORK,
      payTo: X402_SOLANA_PAY_TO,
      price,
      maxTimeoutSeconds: 60,
    });
  }
  return accepts;
}

// ---------------------------------------------------------------------------
// AI-agent detection (browsers pass through free; agents pay)
// ---------------------------------------------------------------------------

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
  const ua = userAgent.toLowerCase();
  return AI_AGENT_PATTERNS.some((pattern) => ua.includes(pattern.toLowerCase()));
}
