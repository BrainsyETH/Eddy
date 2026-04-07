// src/lib/social/video-renderer.ts
// Server-side video rendering via Remotion Lambda.
// Triggers renders on AWS Lambda (parallel frame rendering) and returns the S3 URL.
// No local Chrome/Puppeteer needed — everything runs in the cloud.

const LOG_PREFIX = '[VideoRenderer]';

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
 * Render a Remotion composition to MP4 via AWS Lambda.
 *
 * Prerequisites (one-time setup):
 *   cd remotion && npm run lambda:deploy
 *
 * Required environment variables:
 *   REMOTION_AWS_REGION        — AWS region (e.g. us-east-1)
 *   REMOTION_AWS_ACCESS_KEY_ID — IAM access key with Remotion Lambda permissions
 *   REMOTION_AWS_SECRET_ACCESS_KEY — IAM secret key
 *   REMOTION_LAMBDA_FUNCTION_NAME — deployed Lambda function name
 *   REMOTION_SERVE_URL         — S3 serve URL from deploySite()
 */
export async function renderSocialVideo(params: RenderParams): Promise<RenderResult> {
  const {
    renderMediaOnLambda,
    getRenderProgress,
    speculateFunctionName,
  } = await import('@remotion/lambda/client');

  const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as 'us-east-1';
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
    || speculateFunctionName({ diskSizeInMb: 2048, memorySizeInMb: 2048, timeoutInSeconds: 120 });
  const serveUrl = process.env.REMOTION_SERVE_URL;

  if (!serveUrl) {
    throw new Error('REMOTION_SERVE_URL not set. Run: cd remotion && npm run lambda:deploy');
  }

  console.log(`${LOG_PREFIX} Rendering ${params.compositionId} via Lambda in ${region}`);

  // Trigger the render on Lambda
  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: params.compositionId,
    inputProps: params.inputProps,
    codec: 'h264',
    downloadBehavior: {
      type: 'play-in-browser',
      fileName: `${params.outputFilename}.mp4`,
    },
    privacy: 'public',
    // Parallelize across Lambda workers for speed
    framesPerLambda: 40,
  });

  console.log(`${LOG_PREFIX} Render started: ${renderId} in bucket ${bucketName}`);

  // Poll for completion
  let videoUrl: string | undefined;
  let durationSeconds = 0;

  for (let attempt = 0; attempt < 60; attempt++) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region,
    });

    if (progress.done) {
      videoUrl = progress.outputFile;
      // Calculate duration from the composition metadata
      if (progress.renderMetadata) {
        const { durationInFrames, fps } = progress.renderMetadata.videoConfig;
        durationSeconds = durationInFrames / fps;
      }
      console.log(`${LOG_PREFIX} Render complete: ${videoUrl} (${durationSeconds.toFixed(1)}s)`);
      break;
    }

    if (progress.fatalErrorEncountered) {
      const errorMsg = progress.errors?.[0]?.message || 'Unknown Lambda render error';
      throw new Error(`Lambda render failed: ${errorMsg}`);
    }

    const pct = ((progress.overallProgress ?? 0) * 100).toFixed(0);
    if (attempt % 5 === 0) {
      console.log(`${LOG_PREFIX} Render progress: ${pct}%`);
    }

    // Wait 2 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!videoUrl) {
    throw new Error('Render timed out after 120 seconds');
  }

  return { videoUrl, durationSeconds };
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
