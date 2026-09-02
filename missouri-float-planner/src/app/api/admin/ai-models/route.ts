// src/app/api/admin/ai-models/route.ts
// GET + POST for the per-workload Anthropic model overrides in llm_config.
//
// POST rather than PUT for saves, for the reason /api/admin/social/config gives:
// it keeps write operations off any edge or CDN cache path.
//
// ── What this route will not do ────────────────────────────────────────────
//
// Accept a model id that is not approved for the workload it was sent for.
// llm_config feeds four production generators, so a free-text model field here
// is a way to point the daily cron at an arbitrarily expensive model from a
// browser. Everything is checked against src/lib/ai/model-registry.ts, and
// anything else is a 400 that names what was allowed.
//
// Usage analytics deliberately live at a separate endpoint. A slow or failing
// aggregation must never stop an operator reading — or reverting — the active
// configuration, which is exactly what they will be trying to do when a switch
// has gone wrong.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import {
  MODELS,
  WORKLOADS,
  WORKLOAD_SPECS,
  approvedProfiles,
  isApproved,
  shouldCacheSystemPrompt,
  type Workload,
} from '@/lib/ai/model-registry';
import { resolveConfiguredModels, type LlmConfigRow } from '@/lib/ai/resolve-models';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const LOG_PREFIX = '[AiModels]';

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

/** The stored row, or null when the table has no row yet. */
async function readRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ row: (LlmConfigRow & { id: string }) | null; error: string | null }> {
  // Ordered + limited rather than .single(): social_config accumulated duplicate
  // rows once and .single() masked it by erroring instead of picking one.
  const { data, error } = await supabase
    .from('llm_config')
    .select('id, river_update, gauge_update, global_summary, social_caption')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) return { row: null, error: error.message };
  return { row: data?.[0] ?? null, error: null };
}

/** Configuration + the options the UI may offer, in one payload. */
function buildPayload(row: (LlmConfigRow & { id: string }) | null) {
  const resolved = resolveConfiguredModels(row);
  return {
    workloads: WORKLOADS.map((workload) => {
      const spec = WORKLOAD_SPECS[workload];
      const active = resolved[workload];
      return {
        workload,
        label: spec.label,
        description: spec.description,
        // What the model actually is right now, and whether that came from an
        // override or from code. The UI shows both so "Code default" is never
        // ambiguous about what the default IS.
        effectiveModel: active.id,
        effectiveLabel: MODELS[active.id]?.label ?? active.id,
        source: active.source,
        // A stored value that failed validation. The row keeps it so it is
        // visible and fixable here, while production runs the default.
        rejected: active.rejected ?? null,
        stored: row?.[workload] ?? null,
        defaultModel: spec.default,
        defaultLabel: MODELS[spec.default]?.label ?? spec.default,
        options: approvedProfiles(workload).map((profile) => ({
          id: profile.id,
          label: profile.label,
          maxTokens: spec.maxTokens[profile.id],
          thinkingDisabled: Boolean(profile.thinking),
          promptCacheEnabled: shouldCacheSystemPrompt(workload, profile.id),
        })),
      };
    }),
  };
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { row, error } = await readRow(supabase);

  if (error) {
    console.error(`${LOG_PREFIX} GET failed: ${error}`);
    return NextResponse.json({ error }, { status: 500, headers: CACHE_HEADERS });
  }

  return NextResponse.json(buildPayload(row), { headers: CACHE_HEADERS });
}

export async function POST(request: NextRequest) {
  // Covers 401 for a missing or expired token AND 403 for a cookie-authenticated
  // cross-origin write — requireAdminAuth does the same-origin check itself for
  // unsafe methods, so there is no separate CSRF step here.
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: CACHE_HEADERS },
    );
  }

  // ── Validation ───────────────────────────────────────────────────────────
  // Every key must be a known workload, and every value must be null (meaning
  // "use the code default") or a model approved FOR THAT WORKLOAD. Approved is
  // narrower than API-compatible on purpose: see the registry.
  const updates: Partial<Record<Workload, string | null>> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!WORKLOADS.includes(key as Workload)) {
      return NextResponse.json(
        { error: `Unknown workload "${key}". Expected one of: ${WORKLOADS.join(', ')}` },
        { status: 400, headers: CACHE_HEADERS },
      );
    }
    const workload = key as Workload;

    if (value === null || value === '') {
      updates[workload] = null;
      continue;
    }

    if (typeof value !== 'string') {
      return NextResponse.json(
        { error: `Model for "${workload}" must be a string or null` },
        { status: 400, headers: CACHE_HEADERS },
      );
    }

    const modelId = value.trim();
    if (!MODELS[modelId] || !isApproved(workload, modelId)) {
      return NextResponse.json(
        {
          error:
            `Model "${modelId}" is not approved for ${workload}. ` +
            `Approved: ${WORKLOAD_SPECS[workload].approved.join(', ')}`,
        },
        { status: 400, headers: CACHE_HEADERS },
      );
    }
    updates[workload] = modelId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No workloads supplied' },
      { status: 400, headers: CACHE_HEADERS },
    );
  }

  const supabase = createAdminClient();
  const { row: existing, error: readError } = await readRow(supabase);

  if (readError) {
    console.error(`${LOG_PREFIX} SAVE could not read current config: ${readError}`);
    return NextResponse.json({ error: readError }, { status: 500, headers: CACHE_HEADERS });
  }

  const before: Partial<Record<Workload, string | null>> = {};
  for (const workload of Object.keys(updates) as Workload[]) {
    before[workload] = existing?.[workload] ?? null;
  }

  // The migration seeds a row, but an environment restored without it should
  // still be configurable rather than silently no-op on save.
  const mutation = { ...updates, updated_at: new Date().toISOString() };
  const { error: writeError } = existing
    ? await supabase.from('llm_config').update(mutation).eq('id', existing.id)
    : await supabase.from('llm_config').insert(mutation);

  if (writeError) {
    console.error(`${LOG_PREFIX} SAVE failed: ${writeError.message}`);
    return NextResponse.json(
      { error: writeError.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }

  const audit = await logAdminAction({
    action: 'llm_config_update',
    entityType: 'llm_config',
    entityId: existing?.id,
    details: { from: before, to: updates },
  });

  console.log(
    `${LOG_PREFIX} SAVE applied: ` +
      Object.entries(updates)
        .map(([workload, model]) => `${workload}=${model ?? 'default'}`)
        .join(', '),
  );

  // Re-read so the client renders what was actually stored rather than what it
  // hoped it stored — the same verify-after-write the social config route does.
  //
  // The error is NOT droppable here. buildPayload(null) is a valid-looking
  // payload that says every workload is on its code default, so swallowing a
  // failed read would hand the client the exact opposite of what was just
  // written, under a success toast, on the screen an operator is looking at
  // precisely because something has gone wrong.
  const { row: verified, error: verifyError } = await readRow(supabase);

  if (verifyError) {
    console.error(`${LOG_PREFIX} SAVE verification read failed: ${verifyError}`);
    // 200, not 500: the write landed. A 500 would read as "save failed" and
    // invite a retry of something that already succeeded. No `workloads` key,
    // so the client keeps the operator's selections instead of adopting
    // defaults it cannot confirm.
    return NextResponse.json(
      {
        saved: true,
        verified: false,
        auditLogged: audit.ok,
        warning:
          `Saved, but the configuration could not be re-read to confirm it (${verifyError}). ` +
          `Reload to see what is stored.`,
      },
      { headers: CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ...buildPayload(verified),
      verified: true,
      auditLogged: audit.ok,
      ...(audit.ok ? {} : { warning: `Saved, but the audit log write failed: ${audit.error}` }),
    },
    { headers: CACHE_HEADERS },
  );
}
