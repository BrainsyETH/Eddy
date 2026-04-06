// src/lib/social/video-renderer.ts
// Server-side Remotion video rendering for social media posts.
// Bundles the Remotion project, renders to MP4, uploads to Vercel Blob.

import path from 'path';
import fs from 'fs';
import { put } from '@vercel/blob';

const LOG_PREFIX = '[VideoRenderer]';

// Cache the bundle path across warm invocations
let cachedBundlePath: string | null = null;

interface RenderParams {
  compositionId: string;
  inputProps: Record<string, unknown>;
  outputFilename: string;
}

interface RenderResult {
  videoUrl: string;
  durationSeconds: number;
}

/**
 * Render a Remotion composition to MP4 and upload to Vercel Blob Storage.
 *
 * Requires @remotion/renderer and @remotion/bundler as dependencies.
 * Heavy operation — expect 2-4 minutes for a 240-frame composition.
 */
export async function renderSocialVideo(params: RenderParams): Promise<RenderResult> {
  // Dynamic imports so the main app doesn't bundle Remotion into every route
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const remotionRoot = path.resolve(process.cwd(), '..', 'remotion');
  const entryPoint = path.join(remotionRoot, 'src', 'index.ts');

  console.log(`${LOG_PREFIX} Rendering ${params.compositionId} → ${params.outputFilename}`);

  // Step 1: Bundle (cached for warm starts)
  if (!cachedBundlePath || !fs.existsSync(cachedBundlePath)) {
    console.log(`${LOG_PREFIX} Bundling Remotion project...`);
    cachedBundlePath = await bundle({
      entryPoint,
      webpackOverride: (config) => {
        // Enable Tailwind (same override as remotion.config.ts)
        return {
          ...config,
          module: {
            ...config.module,
            rules: [
              ...(config.module?.rules || []),
              {
                test: /\.css$/,
                use: [
                  'style-loader',
                  'css-loader',
                  {
                    loader: 'postcss-loader',
                    options: {
                      postcssOptions: {
                        plugins: ['tailwindcss', 'autoprefixer'],
                      },
                    },
                  },
                ],
              },
            ],
          },
        };
      },
    });
    console.log(`${LOG_PREFIX} Bundle ready at ${cachedBundlePath}`);
  } else {
    console.log(`${LOG_PREFIX} Using cached bundle`);
  }

  // Step 2: Select composition with input props
  const composition = await selectComposition({
    serveUrl: cachedBundlePath,
    id: params.compositionId,
    inputProps: params.inputProps,
  });

  // Step 3: Render to /tmp
  const outputPath = path.join('/tmp', `${params.outputFilename}.mp4`);

  await renderMedia({
    composition,
    serveUrl: cachedBundlePath,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: params.inputProps,
    chromiumOptions: {
      gl: 'angle',
    },
  });

  const stats = fs.statSync(outputPath);
  const durationSeconds = composition.durationInFrames / composition.fps;
  console.log(
    `${LOG_PREFIX} Rendered ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB, ${durationSeconds.toFixed(1)}s)`
  );

  // Step 4: Upload to Vercel Blob
  const datePrefix = new Date().toISOString().slice(0, 10);
  const blobPath = `social-videos/${datePrefix}/${params.outputFilename}.mp4`;

  const fileBuffer = fs.readFileSync(outputPath);
  const blob = await put(blobPath, fileBuffer, {
    access: 'public',
    contentType: 'video/mp4',
  });

  console.log(`${LOG_PREFIX} Uploaded to ${blob.url}`);

  // Step 5: Cleanup
  try {
    fs.unlinkSync(outputPath);
  } catch {
    // ignore cleanup errors
  }

  return {
    videoUrl: blob.url,
    durationSeconds,
  };
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
  },
  platform: 'instagram' | 'facebook'
): { compositionId: string; inputProps: Record<string, unknown>; outputFilename: string } {
  const format = platform === 'instagram' ? 'portrait' : 'square';

  switch (postType) {
    case 'river_highlight':
      return {
        compositionId: format === 'portrait' ? 'social-gauge-portrait' : 'social-gauge',
        inputProps: {
          riverName: data.riverName || 'Unknown River',
          conditionCode: data.conditionCode || 'unknown',
          gaugeHeightFt: data.gaugeHeightFt ?? 0,
          optimalMin: data.optimalMin ?? 1.5,
          optimalMax: data.optimalMax ?? 4.0,
          quoteText: data.quoteText || data.summaryText || '',
          format,
        },
        outputFilename: `highlight-${(data.riverName || 'river').toLowerCase().replace(/\s+/g, '-')}-${platform}`,
      };

    case 'daily_digest':
      return {
        compositionId: format === 'portrait' ? 'social-digest-portrait' : 'social-digest',
        inputProps: {
          rivers: data.rivers || [],
          dateLabel: data.dateLabel || new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          format,
        },
        outputFilename: `digest-${new Date().toISOString().slice(0, 10)}-${platform}`,
      };

    case 'branded_loop':
      return {
        compositionId: 'social-branded-loop',
        inputProps: {
          riverName: data.riverName || 'Unknown River',
          conditionCode: data.conditionCode || 'unknown',
          summaryText: data.summaryText || data.quoteText || '',
        },
        outputFilename: `loop-${(data.riverName || 'river').toLowerCase().replace(/\s+/g, '-')}-${platform}`,
      };
  }
}
