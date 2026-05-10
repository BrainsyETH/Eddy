// src/app/api/admin/social/preflight/route.ts
// GET — verify GH_ACTIONS_TOKEN can see render-social-video.yml on the
// configured ref. Catches expired/rotated PATs and missing scopes WITHOUT
// triggering an actual render.
//
// Recommended: hit this from a daily cron (or post-deploy) and alert if it
// returns 401/404 — that's how we avoid recurring the May 7 silent-fallback
// outage.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_OWNER = 'BrainsyETH';
const DEFAULT_REPO = 'Eddy';
const DEFAULT_REF = 'main';
const WORKFLOW_FILE = 'render-social-video.yml';

interface PreflightResponse {
  ok: boolean;
  reason: string | null;
  checks: {
    tokenSet: boolean;
    workflowVisible: boolean | null;
    workflowState: string | null;
    refResolvable: boolean | null;
  };
  config: {
    owner: string;
    repo: string;
    ref: string;
    workflow: string;
  };
  generatedAt: string;
}

function fail(reason: string, partial: Partial<PreflightResponse['checks']>): PreflightResponse {
  return {
    ok: false,
    reason,
    checks: {
      tokenSet: partial.tokenSet ?? false,
      workflowVisible: partial.workflowVisible ?? null,
      workflowState: partial.workflowState ?? null,
      refResolvable: partial.refResolvable ?? null,
    },
    config: {
      owner: process.env.GH_REPO_OWNER || DEFAULT_OWNER,
      repo: process.env.GH_REPO_NAME || DEFAULT_REPO,
      ref: process.env.GH_ACTIONS_REF || DEFAULT_REF,
      workflow: WORKFLOW_FILE,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    return NextResponse.json(fail('GH_ACTIONS_TOKEN not set', { tokenSet: false }), {
      status: 500,
    });
  }

  const owner = process.env.GH_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.GH_REPO_NAME || DEFAULT_REPO;
  const ref = process.env.GH_ACTIONS_REF || DEFAULT_REF;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  // Probe 1: workflow visible to this token. 401 = expired/wrong PAT,
  // 403 = scope missing, 404 = repo or workflow file not found.
  const workflowUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}`;
  let workflowState: string | null = null;
  try {
    const wfResp = await fetch(workflowUrl, { headers });
    if (!wfResp.ok) {
      return NextResponse.json(
        fail(
          `GitHub workflow probe returned ${wfResp.status}: ${(await wfResp.text()).slice(0, 200)}`,
          { tokenSet: true, workflowVisible: false },
        ),
        { status: wfResp.status === 404 ? 404 : 401 },
      );
    }
    const wfBody = (await wfResp.json()) as { state?: string };
    workflowState = wfBody.state ?? null;
    if (workflowState && workflowState !== 'active') {
      return NextResponse.json(
        fail(`Workflow exists but is in state '${workflowState}' (expected 'active')`, {
          tokenSet: true,
          workflowVisible: true,
          workflowState,
        }),
        { status: 409 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      fail(`Workflow probe network error: ${msg}`, { tokenSet: true, workflowVisible: false }),
      { status: 502 },
    );
  }

  // Probe 2: ref resolves. Catches misconfigured GH_ACTIONS_REF before the
  // first user-triggered dispatch.
  const refUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
  try {
    const refResp = await fetch(refUrl, { headers });
    if (!refResp.ok) {
      return NextResponse.json(
        fail(`Ref '${ref}' did not resolve: ${refResp.status}`, {
          tokenSet: true,
          workflowVisible: true,
          workflowState,
          refResolvable: false,
        }),
        { status: 404 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      fail(`Ref probe network error: ${msg}`, {
        tokenSet: true,
        workflowVisible: true,
        workflowState,
        refResolvable: false,
      }),
      { status: 502 },
    );
  }

  const response: PreflightResponse = {
    ok: true,
    reason: null,
    checks: {
      tokenSet: true,
      workflowVisible: true,
      workflowState,
      refResolvable: true,
    },
    config: { owner, repo, ref, workflow: WORKFLOW_FILE },
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(response);
}
