import { AGENT_TOOLS } from './catalog';
export const MAX_BODY_BYTES = 32 * 1024;

/** Bounded parsing, before any database work. Reject JSON-RPC batches so a
 * single rate-limited request cannot smuggle many expensive tool invocations. */
export async function readMcpBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new Error('too_large');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (Array.isArray(body) || !body || typeof body !== 'object') throw new Error('invalid_request');
  return body;
}
export function expensiveTool(body: unknown): string | null {
  const value = body as { method?: string; params?: { name?: string } } | null;
  if (value?.method !== 'tools/call') return null;
  return AGENT_TOOLS.find(t => t.heavy && t.name === value.params?.name)?.name ?? null;
}
export function validOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Native/cloud MCP clients do not send Origin.
  try { return new URL(origin).origin === new URL(req.url).origin; } catch { return false; }
}
