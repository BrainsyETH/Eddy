// src/lib/social/video-renderer.ts
// Triggers video rendering via GitHub Actions workflow_dispatch.
// ONE render per video — the callback publishes to all platforms.
//
// Required environment variables:
//   GH_ACTIONS_TOKEN  — GitHub PAT with 'actions:write' scope
//   GH_REPO_OWNER     — GitHub repo owner (default: 'BrainsyETH')
//   GH_ACTIONS_REF    — Git ref for workflow dispatch (default: 'main')

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
 * Map post type + river data to a Remotion composition ID and input props.
 */
export function getCompositionForPost(
  postType: 'daily_digest' | 'river_highlight' | 'branded_loop',
  data: {
    riverName?: string;
    conditionCode?: string;
    gaugeHeightFt?: number | null;
    optimalMin?: number;
    optimalMax?: number;
    quoteText?: string;
    summaryText?: string;
    rivers?: Array<{
      riverName: string;
      conditionCode: string;
      gaugeHeightFt: number | null;
    }>;
    dateLabel?: string;
    globalQuote?: string;
  },
): { compositionId: string; inputProps: Record<string, unknown>; outputFilename: string } {
  // Always portrait — both platforms get 1080x1920
  const format = 'portrait' as const;

  // Default date label used by compositions that render it — matches the
  // OG thumbnail's timestamp format so the grid cover and the reel stay
  // consistent.
  const defaultDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  switch (postType) {
    case 'river_highlight':
      return {
        compositionId: 'social-gauge-portrait',
        inputProps: {
          riverName: data.riverName || 'Unknown River',
          conditionCode: data.conditionCode || 'unknown',
          gaugeHeightFt: data.gaugeHeightFt ?? 0,
          optimalMin: data.optimalMin ?? 1.5,
          optimalMax: data.optimalMax ?? 4.0,
          quoteText: data.quoteText || data.summaryText || '',
          dateLabel: data.dateLabel || defaultDate,
          format,
        },
        outputFilename: `highlight-${(data.riverName || 'river').toLowerCase().replace(/\s+/g, '-')}`,
      };

    case 'daily_digest':
      return {
        compositionId: 'social-digest-portrait',
        inputProps: {
          rivers: data.rivers || [],
          dateLabel: data.dateLabel || new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          globalQuote: data.globalQuote || undefined,
          format,
        },
        outputFilename: `digest-${new Date().toISOString().slice(0, 10)}`,
      };

    case 'branded_loop':
      return {
        compositionId: 'social-branded-loop',
        inputProps: {
          riverName: data.riverName || 'Unknown River',
          conditionCode: data.conditionCode || 'unknown',
          summaryText: data.summaryText || data.quoteText || '',
        },
        outputFilename: `loop-${(data.riverName || 'river').toLowerCase().replace(/\s+/g, '-')}`,
      };
  }
}
