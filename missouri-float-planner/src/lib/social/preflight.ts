// src/lib/social/preflight.ts
// Verifies that GH_ACTIONS_TOKEN can see the render workflow on the
// configured ref WITHOUT triggering an actual render. Shared between the
// admin endpoint (manual check) and the daily cron (regression alarm).

const DEFAULT_OWNER = 'BrainsyETH';
const DEFAULT_REPO = 'Eddy';
const DEFAULT_REF = 'main';
const WORKFLOW_FILE = 'render-social-video.yml';

export interface PreflightResult {
  ok: boolean;
  // 200 if everything green; 401/404/409/502/500 otherwise. Lets the caller
  // forward the status to the wire without re-mapping reasons.
  httpStatus: number;
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

function buildResult(
  ok: boolean,
  httpStatus: number,
  reason: string | null,
  partial: Partial<PreflightResult['checks']>,
): PreflightResult {
  return {
    ok,
    httpStatus,
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

export async function runPreflight(): Promise<PreflightResult> {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    return buildResult(false, 500, 'GH_ACTIONS_TOKEN not set', { tokenSet: false });
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
      return buildResult(
        false,
        wfResp.status === 404 ? 404 : 401,
        `GitHub workflow probe returned ${wfResp.status}: ${(await wfResp.text()).slice(0, 200)}`,
        { tokenSet: true, workflowVisible: false },
      );
    }
    const wfBody = (await wfResp.json()) as { state?: string };
    workflowState = wfBody.state ?? null;
    if (workflowState && workflowState !== 'active') {
      return buildResult(
        false,
        409,
        `Workflow exists but is in state '${workflowState}' (expected 'active')`,
        { tokenSet: true, workflowVisible: true, workflowState },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return buildResult(false, 502, `Workflow probe network error: ${msg}`, {
      tokenSet: true,
      workflowVisible: false,
    });
  }

  // Probe 2: ref resolves. Catches misconfigured GH_ACTIONS_REF.
  const refUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
  try {
    const refResp = await fetch(refUrl, { headers });
    if (!refResp.ok) {
      return buildResult(false, 404, `Ref '${ref}' did not resolve: ${refResp.status}`, {
        tokenSet: true,
        workflowVisible: true,
        workflowState,
        refResolvable: false,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return buildResult(false, 502, `Ref probe network error: ${msg}`, {
      tokenSet: true,
      workflowVisible: true,
      workflowState,
      refResolvable: false,
    });
  }

  return buildResult(true, 200, null, {
    tokenSet: true,
    workflowVisible: true,
    workflowState,
    refResolvable: true,
  });
}
