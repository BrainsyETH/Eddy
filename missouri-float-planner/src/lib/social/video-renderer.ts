// src/lib/social/video-renderer.ts
// Triggers video rendering via GitHub Actions workflow_dispatch.
// ONE render per video — the callback publishes to all platforms.
//
// Required environment variables:
//   GH_ACTIONS_TOKEN  — GitHub PAT with 'actions:write' scope
//   GH_REPO_OWNER     — GitHub repo owner (default: 'BrainsyETH')
//   GH_ACTIONS_REF    — Git ref for workflow dispatch (default: 'main')

import { POST_TYPES, type RenderData } from './post-types';

const LOG_PREFIX = '[VideoRenderer]';

const DEFAULT_OWNER = 'BrainsyETH';
const DEFAULT_REPO = 'Eddy';
const DEFAULT_REF = 'main';
const WORKFLOW_FILE = 'render-social-video.yml';

interface TriggerRenderParams {
  /** Comma-separated DB record IDs (one per platform) */
  postIds: string;
  compositionId: string;
  inputProps: Record<string, unknown>;
  outputFilename: string;
}

/**
 * Trigger a video render via GitHub Actions.
 * Fire-and-forget — the workflow calls back when done.
 * Returns true if the workflow was dispatched successfully.
 */
export async function triggerVideoRender(params: TriggerRenderParams): Promise<boolean> {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    console.error(`${LOG_PREFIX} GH_ACTIONS_TOKEN not set — cannot trigger video render`);
    return false;
  }

  const owner = process.env.GH_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.GH_REPO_NAME || DEFAULT_REPO;
  const ref = process.env.GH_ACTIONS_REF || DEFAULT_REF;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  console.log(`${LOG_PREFIX} Triggering render: ${params.compositionId} → ${params.outputFilename} (posts: ${params.postIds})`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref,
      inputs: {
        post_ids: params.postIds,
        composition_id: params.compositionId,
        input_props: JSON.stringify(params.inputProps),
        output_filename: params.outputFilename,
      },
    }),
  });

  if (response.status === 204) {
    console.log(`${LOG_PREFIX} Workflow dispatched successfully`);
    return true;
  }

  const errorBody = await response.text();
  console.error(`${LOG_PREFIX} Workflow dispatch failed (${response.status}): ${errorBody}`);
  return false;
}

/**
 * Map post type + river data to a Remotion composition ID and input props.
 */
// ─── ClipEngine workflow dispatchers ───

interface ClipPipelineParams {
  youtubeUrl?: string;
  riverSlug?: string;
  peakNumber?: number;
  maxClips?: number;
}

/**
 * Trigger the YouTube clip extraction pipeline via GitHub Actions.
 */
export async function triggerClipPipeline(params: ClipPipelineParams): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    console.error(`${LOG_PREFIX} GH_ACTIONS_TOKEN not set`);
    return { ok: false, error: 'GH_ACTIONS_TOKEN not set' };
  }

  const owner = process.env.GH_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.GH_REPO_NAME || DEFAULT_REPO;
  const ref = process.env.GH_ACTIONS_REF || DEFAULT_REF;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/youtube-clip-pipeline.yml/dispatches`;

  console.log(`${LOG_PREFIX} Triggering clip pipeline: url=${params.youtubeUrl || 'channel-scan'} ref=${ref}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref,
      inputs: {
        youtube_url: params.youtubeUrl || '',
        river_slug: params.riverSlug || '',
        peak_number: String(params.peakNumber || 1),
        max_clips: String(params.maxClips || 3),
      },
    }),
  });

  if (response.status === 204) {
    console.log(`${LOG_PREFIX} Clip pipeline dispatched`);
    return { ok: true };
  }

  const errorBody = await response.text();
  console.error(`${LOG_PREFIX} Clip pipeline dispatch failed (${response.status}): ${errorBody}`);
  return { ok: false, error: `GitHub API ${response.status}: ${errorBody}` };
}

interface CompileHighlightsParams {
  clipIds: string;
  title: string;
  postIds: string;
  outputFilename: string;
}

/**
 * Trigger the highlights/montage compilation workflow.
 */
export async function triggerCompileHighlights(params: CompileHighlightsParams): Promise<boolean> {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    console.error(`${LOG_PREFIX} GH_ACTIONS_TOKEN not set`);
    return false;
  }

  const owner = process.env.GH_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.GH_REPO_NAME || DEFAULT_REPO;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/compile-highlights.yml/dispatches`;

  console.log(`${LOG_PREFIX} Triggering highlights compile: ${params.clipIds}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: process.env.GH_ACTIONS_REF || DEFAULT_REF,
      inputs: {
        clip_ids: params.clipIds,
        title: params.title,
        post_ids: params.postIds,
        output_filename: params.outputFilename,
      },
    }),
  });

  if (response.status === 204) {
    console.log(`${LOG_PREFIX} Highlights workflow dispatched`);
    return true;
  }

  const errorBody = await response.text();
  console.error(`${LOG_PREFIX} Highlights dispatch failed (${response.status}): ${errorBody}`);
  return false;
}

interface BrandCheckParams {
  clipId: string;
  clipUrl: string;
}

/**
 * Trigger brand safety check on a clip via GitHub Actions.
 */
export async function triggerBrandCheck(params: BrandCheckParams): Promise<boolean> {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    console.error(`${LOG_PREFIX} GH_ACTIONS_TOKEN not set`);
    return false;
  }

  const owner = process.env.GH_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.GH_REPO_NAME || DEFAULT_REPO;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/brand-check-clip.yml/dispatches`;

  console.log(`${LOG_PREFIX} Triggering brand check: ${params.clipId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: process.env.GH_ACTIONS_REF || DEFAULT_REF,
      inputs: {
        clip_id: params.clipId,
        clip_url: params.clipUrl,
      },
    }),
  });

  if (response.status === 204) {
    console.log(`${LOG_PREFIX} Brand check dispatched`);
    return true;
  }

  const errorBody = await response.text();
  console.error(`${LOG_PREFIX} Brand check dispatch failed (${response.status}): ${errorBody}`);
  return false;
}

/**
 * Map post type + render data to a Remotion composition ID and input props.
 * Thin lookup over POST_TYPES (the single source of truth in post-types.ts).
 */
export function getCompositionForPost(
  postType:
    | 'daily_digest'
    | 'river_highlight'
    | 'weekly_forecast'
    | 'section_guide'
    | 'weekly_trend',
  data: RenderData,
): { compositionId: string; inputProps: Record<string, unknown>; outputFilename: string } {
  const def = POST_TYPES[postType];
  if (!def?.composition || !def.renderProps || !def.outputFilename) {
    throw new Error(`Post type "${postType}" has no video composition`);
  }
  return {
    compositionId: def.composition,
    inputProps: def.renderProps(data),
    outputFilename: def.outputFilename(data),
  };
}
