import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getClientIp } from '@/lib/rate-limit';
import { createMcpLimiter } from '@/lib/agent-tools/limits';
import { readMcpBody, validOrigin } from '@/lib/agent-tools/http';
import { findNearbyFloats } from '@/lib/agent-tools/nearby-search';
import { approximateLocation } from '@shared/float-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const schema = z
  .object({
    near: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    river: z.string().trim().min(1).max(120).optional(),
    radiusMiles: z.number().min(10).max(300).default(100),
    targetHours: z.number().min(0.5).max(12),
    vesselType: z.enum(['canoe', 'kayak', 'raft', 'tube']).default('canoe'),
    publicOnly: z.boolean().default(true),
  })
  .strict()
  .refine((input) => input.near || input.river, 'Choose a location or river');

/** Location stays out of URLs, response payloads and application logs. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!validOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const limiter = createMcpLimiter(getClientIp(request));
  const general = await limiter.general();
  if (general) return general;
  let parsed;
  try {
    parsed = schema.safeParse(await readMcpBody(request));
  } catch {
    return Response.json(
      { error: 'Invalid search request' },
      { status: 400, headers },
    );
  }
  if (!parsed.success)
    return Response.json(
      { error: 'Choose a location or river, a boat, and 0.5–12 hours.' },
      { status: 400, headers },
    );
  const limited = await limiter.tool({
    method: 'tools/call',
    params: { name: 'find_floats' },
  });
  if (limited) return limited;
  const input = parsed.data;
  if (input.near) input.near = approximateLocation(input.near);
  try {
    const result = await findNearbyFloats(await createClient(), input, {
      signal: request.signal,
    });
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: 'Float search is unavailable. Please try again.' },
      { status: 503, headers },
    );
  }
}
