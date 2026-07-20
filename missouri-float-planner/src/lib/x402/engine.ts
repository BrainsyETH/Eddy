// x402 V2 engine — Next.js 14 adapter over @x402/core@2.18.
//
// The official @x402/next package requires Next.js >= 16, so we drive the
// framework-agnostic core primitives directly. ALL payment verification and
// settlement happens inside @x402/core (`processHTTPRequest` / `processSettlement`);
// this module only adapts request/response I/O for Next 14 and preserves Eddy's
// "browsers free, AI agents pay" policy. The orchestration mirrors @x402/next's
// `withX402` (verify → run handler → settle only after a <400 response).

import { NextRequest, NextResponse } from 'next/server';
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  HTTPFacilitatorClient,
  FacilitatorResponseError,
  getFacilitatorResponseError,
  SETTLEMENT_OVERRIDES_HEADER,
  type RouteConfig,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
  type PaymentCancellationDispatcher,
} from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import {
  createSIWxResourceServerExtension,
  InMemorySIWxStorage,
  type SIWxStorage,
} from '@x402/extensions/sign-in-with-x';
import { bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import {
  BASE_NETWORK,
  SOLANA_NETWORK,
  X402_ENABLED,
  X402_PAY_TO,
  X402_SOLANA_PAY_TO,
  X402_SIWX_ENABLED,
  X402_BAZAAR_ENABLED,
  X402_ROUTES,
  type X402RouteKey,
  buildAccepts,
  getFacilitatorConfig,
  isAiAgent,
} from './config';

const SERVICE_NAME = 'Eddy — Missouri Float Trip Planner';

// ---------------------------------------------------------------------------
// Next.js 14 HTTP adapter (identical surface to @x402/next's NextAdapter)
// ---------------------------------------------------------------------------

class NextAdapter implements HTTPAdapter {
  constructor(private readonly req: NextRequest) {}

  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) || undefined;
  }
  getMethod(): string {
    return this.req.method;
  }
  getPath(): string {
    return this.req.nextUrl.pathname;
  }
  getUrl(): string {
    return this.req.url;
  }
  getAcceptHeader(): string {
    return this.req.headers.get('Accept') || '';
  }
  getUserAgent(): string {
    return this.req.headers.get('User-Agent') || '';
  }
  getQueryParams(): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    this.req.nextUrl.searchParams.forEach((value, key) => {
      const existing = params[key];
      if (existing) {
        if (Array.isArray(existing)) existing.push(value);
        else params[key] = [existing, value];
      } else {
        params[key] = value;
      }
    });
    return params;
  }
  getQueryParam(name: string): string | string[] | undefined {
    const all = this.req.nextUrl.searchParams.getAll(name);
    if (all.length === 0) return undefined;
    if (all.length === 1) return all[0];
    return all;
  }
  async getBody(): Promise<unknown> {
    try {
      return await this.req.json();
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton resource server (facilitator + schemes + extensions)
// ---------------------------------------------------------------------------

let resourceServerSingleton: x402ResourceServer | null = null;
let siwxStorageSingleton: SIWxStorage | null = null;

function getSiwxStorage(): SIWxStorage {
  // NOTE: in-memory storage is per-instance. On serverless (Vercel) sessions
  // won't persist across cold starts / instances — supply a persistent
  // SIWxStorage (e.g. Supabase- or Redis-backed) for production session reuse.
  if (!siwxStorageSingleton) siwxStorageSingleton = new InMemorySIWxStorage();
  return siwxStorageSingleton;
}

function getResourceServer(): x402ResourceServer {
  if (resourceServerSingleton) return resourceServerSingleton;

  const server = new x402ResourceServer(new HTTPFacilitatorClient(getFacilitatorConfig()));

  if (X402_PAY_TO) registerExactEvmScheme(server, { networks: [BASE_NETWORK] });
  if (X402_SOLANA_PAY_TO) registerExactSvmScheme(server, { networks: [SOLANA_NETWORK] });

  if (X402_SIWX_ENABLED) {
    server.registerExtension(createSIWxResourceServerExtension({ storage: getSiwxStorage() }));
  }
  if (X402_BAZAAR_ENABLED && !server.hasExtension('bazaar')) {
    server.registerExtension(bazaarResourceServerExtension);
  }

  resourceServerSingleton = server;
  return server;
}

/** Lazily sync the facilitator once, allowing retries after a failure. */
function prepareServer(httpServer: x402HTTPResourceServer) {
  let initPromise: Promise<void> | null = null;
  let initialized = false;
  return async function ensureReady(): Promise<void> {
    if (initialized) return;
    if (!initPromise) initPromise = httpServer.initialize();
    try {
      await initPromise;
      initialized = true;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function facilitatorErrorResponse(error: { message: string }): NextResponse {
  return new NextResponse(JSON.stringify({ error: error.message }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handlePaymentError(instructions: HTTPResponseInstructions): NextResponse {
  const headers = new Headers(instructions.headers as Record<string, string>);
  if (instructions.isHtml) {
    headers.set('Content-Type', 'text/html');
    return new NextResponse(instructions.body as string, { status: instructions.status, headers });
  }
  headers.set('Content-Type', 'application/json');
  return new NextResponse(JSON.stringify(instructions.body ?? {}), {
    status: instructions.status,
    headers,
  });
}

function createRequestContext(request: NextRequest): HTTPRequestContext {
  const adapter = new NextAdapter(request);
  return {
    adapter,
    path: request.nextUrl.pathname,
    method: request.method,
    paymentHeader: adapter.getHeader('payment-signature') || adapter.getHeader('x-payment'),
  };
}

/** Settle only after a successful handler response; attach the PAYMENT-RESPONSE header. */
async function handleSettlement(
  httpServer: x402HTTPResourceServer,
  response: NextResponse,
  paymentPayload: PaymentPayload,
  requirements: PaymentRequirements,
  declaredExtensions: Record<string, unknown> | undefined,
  cancellationDispatcher: PaymentCancellationDispatcher,
  httpContext: HTTPRequestContext,
): Promise<NextResponse> {
  if (response.status >= 400) {
    // Handler failed — do NOT charge the agent.
    await cancellationDispatcher.cancel({ reason: 'handler_failed', responseStatus: response.status });
    response.headers.delete(SETTLEMENT_OVERRIDES_HEADER);
    return response;
  }
  try {
    const responseBody = Buffer.from(await response.clone().arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const result = await httpServer.processSettlement(paymentPayload, requirements, declaredExtensions, {
      request: httpContext,
      responseBody,
      responseHeaders,
    });

    if (!result.success) {
      const r = result.response;
      const body = r.isHtml ? (r.body as string) : JSON.stringify(r.body ?? {});
      return new NextResponse(body, { status: r.status, headers: r.headers as Record<string, string> });
    }

    Object.entries(result.headers).forEach(([key, value]) => response.headers.set(key, value));
    response.headers.delete(SETTLEMENT_OVERRIDES_HEADER);
    return response;
  } catch (error) {
    if (error instanceof FacilitatorResponseError) return facilitatorErrorResponse(error);
    console.error('x402 settlement failed:', error);
    return new NextResponse(JSON.stringify({}), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// Public wrapper — preserves the existing withX402Route call shape
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js App Router API handler with x402 payment protection for AI
 * agents. Regular browser traffic passes through free; AI agents must present a
 * valid x402 payment (settled only after a successful response). Price and
 * description come from the single-source `X402_ROUTES` table via `routeKey`.
 *
 * Dynamic routes pass their context type as the generic, e.g.
 *   withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/rivers/:slug')
 */
type StaticRouteContext = { params: Promise<Record<string, never>> };

export function withX402Route<C = StaticRouteContext>(
  handler: (request: NextRequest, context: C) => Promise<NextResponse>,
  routeKey: X402RouteKey,
) {
  // Dormant (no payout address configured) → return the handler untouched.
  if (!X402_ENABLED) return handler;

  const meta = X402_ROUTES[routeKey];
  const routeConfig: RouteConfig = {
    accepts: buildAccepts(meta.price),
    description: meta.description,
    mimeType: 'application/json',
    serviceName: SERVICE_NAME,
    tags: ['missouri', 'rivers', 'float-trips', 'weather', 'gauges'],
  };
  const httpServer = new x402HTTPResourceServer(getResourceServer(), { '*': routeConfig });
  const ensureReady = prepareServer(httpServer);

  return async function x402Handler(request: NextRequest, context: C): Promise<NextResponse> {
    const runHandler = (req: NextRequest) => handler(req, context);

    // Browsers / non-agent traffic: free passthrough.
    if (!isAiAgent(request.headers.get('user-agent'))) {
      return runHandler(request);
    }

    try {
      await ensureReady();
    } catch (err) {
      const facilitatorError = getFacilitatorResponseError(err);
      if (facilitatorError) return facilitatorErrorResponse(facilitatorError);
      throw err;
    }

    const requestContext = createRequestContext(request);
    let result;
    try {
      result = await httpServer.processHTTPRequest(requestContext);
    } catch (err) {
      if (err instanceof FacilitatorResponseError) return facilitatorErrorResponse(err);
      throw err;
    }

    switch (result.type) {
      case 'no-payment-required':
        return runHandler(request);
      case 'payment-error':
        return handlePaymentError(result.response);
      case 'payment-verified': {
        let handlerResponse: NextResponse;
        try {
          handlerResponse = await runHandler(request);
        } catch (error) {
          await result.cancellationDispatcher.cancel({ reason: 'handler_threw', error });
          throw error;
        }
        return handleSettlement(
          httpServer,
          handlerResponse,
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          result.cancellationDispatcher,
          requestContext,
        );
      }
      default:
        return runHandler(request);
    }
  };
}
