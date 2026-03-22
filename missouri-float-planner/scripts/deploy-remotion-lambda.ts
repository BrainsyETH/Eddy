/**
 * Deploy Remotion Lambda function and bundle site to AWS.
 *
 * Prerequisites:
 * - AWS credentials configured (REMOTION_AWS_ACCESS_KEY_ID + REMOTION_AWS_SECRET_ACCESS_KEY)
 * - Or default AWS credentials via ~/.aws/credentials
 *
 * Usage:
 *   npm run remotion:deploy-lambda
 *
 * After deployment, set these env vars in Vercel:
 *   REMOTION_LAMBDA_FUNCTION_NAME=<output function name>
 *   REMOTION_SERVE_URL=<output serve URL>
 *   REMOTION_AWS_REGION=us-east-1
 */

import path from 'path';

async function deploy() {
  // Dynamic imports to avoid bundling Lambda SDK in Next.js
  const { deployFunction, deploySite, getOrCreateBucket } = await import(
    '@remotion/lambda'
  );
  const { bundle } = await import('@remotion/bundler');

  const region = 'us-east-1' as const;
  const entryPoint = path.resolve(__dirname, '../src/remotion/Root.tsx');

  console.log('Step 1/4: Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint,
    // Enable webpack caching for faster subsequent bundles
    webpackOverride: (config) => config,
  });
  console.log(`  Bundle created at: ${bundleLocation}`);

  console.log('Step 2/4: Getting or creating S3 bucket...');
  const { bucketName } = await getOrCreateBucket({ region });
  console.log(`  Using bucket: ${bucketName}`);

  console.log('Step 3/4: Uploading bundle to S3...');
  const { serveUrl } = await deploySite({
    bucketName,
    entryPoint: bundleLocation,
    region,
    siteName: 'eddy-reels',
  });
  console.log(`  Serve URL: ${serveUrl}`);

  console.log('Step 4/4: Deploying Lambda function...');
  const { functionName } = await deployFunction({
    region,
    timeoutInSeconds: 120,
    memorySizeInMb: 2048,
    diskSizeInMb: 2048,
    createCloudWatchLogGroup: true,
  });
  console.log(`  Function name: ${functionName}`);

  console.log('\n✅ Deployment complete!\n');
  console.log('Add these to your Vercel environment variables:');
  console.log(`  REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`  REMOTION_SERVE_URL=${serveUrl}`);
  console.log(`  REMOTION_AWS_REGION=${region}`);
}

deploy().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
