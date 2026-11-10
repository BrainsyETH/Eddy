// src/lib/social/workflow-inputs.ts
// Validation for values an admin request hands to a GitHub Actions workflow.
//
// A workflow dispatch input ends up on a runner that holds production secrets.
// The workflows treat inputs as data (env + jq, never script text), and
// `workflow-inputs.test.ts` fails if one starts interpolating them again. This
// is the other half: the API refuses values that are not the shape the
// pipeline expects, so a malformed request is a 400 here instead of a
// confusing failure — or worse — three steps into a CI run.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

export const MAX_COMPILE_CLIPS = 20;
export const MAX_TITLE_LENGTH = 120;
export const MAX_PEAK_NUMBER = 20;
export const MAX_PIPELINE_CLIPS = 10;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function uuidList(value: unknown, label: string, min: number): Parsed<string[]> {
  if (!Array.isArray(value)) return fail(`${label} must be a list of IDs`);
  if (value.length < min) return fail(`Need at least ${min} ${label}`);
  if (value.length > MAX_COMPILE_CLIPS) return fail(`At most ${MAX_COMPILE_CLIPS} ${label}`);
  for (const id of value) {
    if (typeof id !== 'string' || !UUID.test(id)) return fail(`${label} contains an invalid ID`);
  }
  return { ok: true, value: value as string[] };
}

function boundedInt(value: unknown, label: string, fallback: number, max: number): Parsed<number> {
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    return fail(`${label} must be a whole number from 1 to ${max}`);
  }
  return { ok: true, value };
}

export interface CompileHighlightsInputs {
  clipIds: string[];
  postIds: string[];
  title: string;
  outputFilename: string | null;
}

export function parseCompileHighlightsInputs(body: unknown): Parsed<CompileHighlightsInputs> {
  if (!body || typeof body !== 'object') return fail('Invalid request body');
  const { clipIds, postIds, title, outputFilename } = body as Record<string, unknown>;

  const clips = uuidList(clipIds, 'clip IDs', 2);
  if (!clips.ok) return clips;

  const posts = postIds === undefined || postIds === null ? { ok: true as const, value: [] } : uuidList(postIds, 'post IDs', 0);
  if (!posts.ok) return posts;

  if (title !== undefined && title !== null && typeof title !== 'string') return fail('title must be text');
  const cleanTitle = (title ?? '').trim();
  // Control characters (newlines included) have no place in an on-video title.
  if (/[\u0000-\u001f\u007f]/.test(cleanTitle)) return fail('title contains control characters');
  if (cleanTitle.length > MAX_TITLE_LENGTH) return fail(`title is longer than ${MAX_TITLE_LENGTH} characters`);

  if (outputFilename !== undefined && outputFilename !== null) {
    if (typeof outputFilename !== 'string' || !FILENAME.test(outputFilename)) {
      return fail('outputFilename may only contain letters, numbers, hyphens and underscores');
    }
  }

  return {
    ok: true,
    value: {
      clipIds: clips.value,
      postIds: posts.value,
      title: cleanTitle,
      outputFilename: (outputFilename as string | null | undefined) ?? null,
    },
  };
}

export interface ClipPipelineInputs {
  youtubeUrl?: string;
  riverSlug?: string;
  peakNumber: number;
  maxClips: number;
}

export function parseClipPipelineInputs(body: unknown): Parsed<ClipPipelineInputs> {
  if (!body || typeof body !== 'object') return fail('Invalid request body');
  const { youtubeUrl, riverSlug, peakNumber, maxClips } = body as Record<string, unknown>;

  let url: string | undefined;
  if (youtubeUrl !== undefined && youtubeUrl !== null && youtubeUrl !== '') {
    if (typeof youtubeUrl !== 'string') return fail('youtubeUrl must be a YouTube link');
    let parsed: URL;
    try {
      parsed = new URL(youtubeUrl.trim());
    } catch {
      return fail('youtubeUrl must be a YouTube link');
    }
    if (parsed.protocol !== 'https:' || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return fail('youtubeUrl must be an https YouTube link');
    }
    // Re-serialized, so what the runner receives is a canonical URL rather
    // than whatever characters happened to parse.
    url = parsed.toString();
  }

  let slug: string | undefined;
  if (riverSlug !== undefined && riverSlug !== null && riverSlug !== '') {
    if (typeof riverSlug !== 'string' || riverSlug.length > 80 || !SLUG.test(riverSlug)) {
      return fail('riverSlug must be a river slug such as "current-river"');
    }
    slug = riverSlug;
  }

  const peak = boundedInt(peakNumber, 'peakNumber', 1, MAX_PEAK_NUMBER);
  if (!peak.ok) return peak;
  const clips = boundedInt(maxClips, 'maxClips', 3, MAX_PIPELINE_CLIPS);
  if (!clips.ok) return clips;

  return { ok: true, value: { youtubeUrl: url, riverSlug: slug, peakNumber: peak.value, maxClips: clips.value } };
}
