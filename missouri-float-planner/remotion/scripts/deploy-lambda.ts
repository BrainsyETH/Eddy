#!/usr/bin/env tsx
/**
 * Deploy Remotion Lambda infrastructure.
 *
 * One-time setup:
 *   1. Create an AWS account and an IAM user with the Remotion Lambda policy
 *      (see https://www.remotion.dev/docs/lambda/permissions)
 *   2. Set environment variables:
 *        export AWS_ACCESS_KEY_ID=...
 *        export AWS_SECRET_ACCESS_KEY=...
 *        export REMOTION_AWS_REGION=us-east-1
 *   3. Run: npm run lambda:deploy
 *
 * This script:
 *   - Deploys (or updates) the Lambda render function
 *   - Bundles and uploads the Remotion site to S3
 *   - Prints the function name and serve URL for your .env
 *
 * Flags:
 *   --site-only      Only re-deploy the site bundle (after composition changes)
 *   --function-only  Only re-deploy the Lambda function (after Remotion version upgrade)
 */

import path from 'path';

const REGION = (process.env.REMOTION_AWS_REGION || 'us-east-1') as 'us-east-1';
const MEMORY_SIZE = 2048;   // MB — good balance of speed and cost
const DISK_SIZE = 2048;     // MB — enough for 1080p renders
const TIMEOUT = 120;        // seconds per Lambda invocation

async function main() {
  const args = process.argv.slice(2);
  const siteOnly = args.includes('--site-only');
  const functionOnly = args.includes('--function-only');

  const {
    deployFunction,
    deploySite,
    getOrCreateBucket,
    speculateFunctionName,
  } = await import('@remotion/lambda');

  console.log(`\n🚀 Remotion Lambda Deploy (region: ${REGION})\n`);

  // Ensure we have a bucket
  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`📦 S3 bucket: ${bucketName}`);

  // --- Deploy Lambda Function ---
  if (!siteOnly) {
    console.log('\n⚡ Deploying Lambda function...');
    const { functionName, alreadyExisted } = await deployFunction({
      region: REGION,
      timeoutInSeconds: TIMEOUT,
      memorySizeInMb: MEMORY_SIZE,
      diskSizeInMb: DISK_SIZE,
      createCloudWatchLogGroup: true,
    });

    console.log(
      alreadyExisted
        ? `   Function already exists: ${functionName}`
        : `   Function deployed: ${functionName}`
    );
    console.log(`   Memory: ${MEMORY_SIZE}MB, Disk: ${DISK_SIZE}MB, Timeout: ${TIMEOUT}s`);
  }

  // --- Deploy Site Bundle ---
  if (!functionOnly) {
    console.log('\n📦 Bundling and uploading site...');
    const entryPoint = path.resolve(__dirname, '..', 'src', 'index.ts');

    const { serveUrl, siteName } = await deploySite({
      region: REGION,
      entryPoint,
      siteName: 'eddy-social-videos',
      enableCaching: true,
    });

    console.log(`   Site name: ${siteName}`);
    console.log(`   Serve URL: ${serveUrl}`);
  }

  // --- Print environment variables ---
  const functionName = speculateFunctionName({
    diskSizeInMb: DISK_SIZE,
    memorySizeInMb: MEMORY_SIZE,
    timeoutInSeconds: TIMEOUT,
  });

  console.log('\n✅ Done! Add these to your Vercel environment variables:\n');
  console.log(`   REMOTION_AWS_REGION=${REGION}`);
  console.log(`   REMOTION_AWS_ACCESS_KEY_ID=<your-access-key>`);
  console.log(`   REMOTION_AWS_SECRET_ACCESS_KEY=<your-secret-key>`);
  console.log(`   REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`   REMOTION_SERVE_URL=<the serve URL printed above>`);
  console.log('');
  console.log('Re-deploy the site after composition changes: npm run lambda:deploy:site');
  console.log('Re-deploy the function after Remotion upgrades: npm run lambda:deploy:function');
  console.log('');
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err.message || err);
  process.exit(1);
});
