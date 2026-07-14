// x402 AI-agent payment configuration — public entry point.
//
// Eddy targets x402 V2 (https://x402.org), built on @x402/core@2.18 (the
// framework-agnostic core) because the official @x402/next adapter requires
// Next.js >= 16 and this app runs on Next 14. Implementation lives in ./x402/*:
//   - ./x402/config  — networks, payout addresses, price table, feature flags
//   - ./x402/engine  — Next 14 adapter + verify/settle orchestration
//
// Payment is enforced per-route (browsers pass through free; AI agents pay),
// so there is no x402 logic in middleware.ts. The whole layer stays dormant
// until a payout address (X402_WALLET_ADDRESS / X402_SOLANA_ADDRESS) is set.

export { withX402Route } from './x402/engine';

export {
  // Detection
  isAiAgent,
  AI_AGENT_PATTERNS,
  // Protocol / discovery metadata (consumed by /.well-known/x402)
  X402_VERSION,
  X402_ENABLED,
  X402_PAY_TO,
  X402_SOLANA_PAY_TO,
  X402_NETWORKS,
  X402_ROUTES,
  X402_FACILITATOR_LABEL,
  X402_BAZAAR_ACTIVE,
  X402_TESTNET,
  BASE_NETWORK,
  SOLANA_NETWORK,
  type X402RouteKey,
  type X402RouteMeta,
} from './x402/config';
