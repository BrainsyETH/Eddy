// src/lib/calculations/flow-inputs.ts
// One way to obtain the two numbers the flow-dependent float-time model needs.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// calculateFloatTime() uses the flow model only when BOTH dischargeCfs and
// refCfs are supplied, and silently falls back to the legacy condition-band step
// when either is missing. The fallback logs nothing and returns a plausible
// number, so a call site that never passed them looks exactly like one that did.
//
// That is not hypothetical. /api/plan fetched the daily statistics and passed
// both; src/lib/chat/tool-handlers.ts and src/lib/social/post-types.ts called
// the same function with the same shared DEFAULT_CANOE_SPEEDS and passed
// neither — the social helper even carried a comment saying it matched the
// planner, which was true of the speeds and false of the model. The same trip
// got a different answer depending on whether you asked the planner, the chat,
// or a social card.
//
// Q_ref is the gauge's daily median (p50). Anything else — a different
// percentile, a different window, a per-river constant — would reintroduce the
// same divergence one level down, so the choice lives here rather than at each
// call site.

import { fetchDailyStatistics } from '@/lib/usgs/gauges';

export interface FlowInputs {
  dischargeCfs: number | null;
  refCfs: number | null;
}

export const NO_FLOW_INPUTS: FlowInputs = { dischargeCfs: null, refCfs: null };

/**
 * Resolve Q and Q_ref for a gauge.
 *
 * Never throws: a statistics lookup that fails degrades to the band model,
 * which is the pre-existing behaviour and strictly better than failing a chat
 * answer or a social render over a percentile fetch.
 */
export async function resolveFlowInputs(
  usgsSiteId: string | null | undefined,
  dischargeCfs: number | null | undefined,
): Promise<FlowInputs> {
  const discharge = dischargeCfs ?? null;
  if (!usgsSiteId || discharge === null) {
    return { dischargeCfs: discharge, refCfs: null };
  }

  try {
    const stats = await fetchDailyStatistics(usgsSiteId);
    return { dischargeCfs: discharge, refCfs: stats?.p50 ?? null };
  } catch {
    return { dischargeCfs: discharge, refCfs: null };
  }
}
