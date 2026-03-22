// Remotion Lambda render client — renders video compositions and uploads to Vercel Blob

import {
  renderMediaOnLambda,
  getRenderProgress,
} from '@remotion/lambda/client';
import { put } from '@vercel/blob';

interface RenderOptions {
  compositionId: string;
  inputProps: Record<string, unknown>;
}

function getLambdaConfig() {
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SERVE_URL;
  const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as 'us-east-1';

  if (!functionName || !serveUrl) {
    throw new Error(
      'Missing REMOTION_LAMBDA_FUNCTION_NAME or REMOTION_SERVE_URL env vars. ' +
      'Run `npm run remotion:deploy-lambda` to set up.'
    );
  }

  return { functionName, serveUrl, region };
}

/**
 * Render a Remotion composition on Lambda and upload the result to Vercel Blob.
 * Returns the public Vercel Blob URL for the rendered MP4.
 */
export async function renderVideo(options: RenderOptions): Promise<string> {
  const { functionName, serveUrl, region } = getLambdaConfig();

  console.log(`[RenderClient] Starting Lambda render: ${options.compositionId}`);

  // Start the render
  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: options.compositionId,
    inputProps: options.inputProps,
    codec: 'h264',
    // Output MP4 compatible with Instagram/Facebook Reels
    imageFormat: 'jpeg',
    maxRetries: 1,
    privacy: 'public',
    downloadBehavior: { type: 'play-in-browser' },
  });

  console.log(`[RenderClient] Render started: ${renderId} in ${bucketName}`);

  // Poll for completion
  const maxPolls = 60; // 60 * 2s = 120s max wait
  for (let i = 0; i < maxPolls; i++) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region,
    });

    if (progress.done) {
      if (!progress.outputFile) {
        throw new Error('Render completed but no output file URL returned');
      }

      console.log(`[RenderClient] Render complete. Uploading to Vercel Blob...`);

      // Download from S3 and upload to Vercel Blob
      const videoResponse = await fetch(progress.outputFile);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download rendered video: HTTP ${videoResponse.status}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      const timestamp = Date.now();
      const filename = `reels/${options.compositionId}-${timestamp}.mp4`;

      const blob = await put(filename, Buffer.from(videoBuffer), {
        access: 'public',
        contentType: 'video/mp4',
      });

      console.log(`[RenderClient] Uploaded to Vercel Blob: ${blob.url}`);
      return blob.url;
    }

    if (progress.fatalErrorEncountered) {
      const errorMsg = progress.errors?.[0]?.message || 'Unknown render error';
      throw new Error(`Lambda render failed: ${errorMsg}`);
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Render timed out after 120 seconds');
}

/**
 * Check if Remotion Lambda is configured and ready.
 */
export function hasRenderConfig(): boolean {
  return Boolean(
    process.env.REMOTION_LAMBDA_FUNCTION_NAME &&
    process.env.REMOTION_SERVE_URL
  );
}
