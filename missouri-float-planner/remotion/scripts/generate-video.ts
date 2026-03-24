/**
 * Server-side video generation pipeline for Eddy tutorial.
 *
 * Automates the entire flow:
 *   1. Captures real screenshots from eddy.guide via Puppeteer
 *   2. Downloads Eddy mascot assets from Vercel Blob
 *   3. Generates voiceover audio via OpenAI TTS API
 *   4. Renders final MP4 videos via @remotion/renderer
 *
 * Usage:
 *   npm run generate            # Full pipeline (assets + render)
 *   npm run generate:assets     # Only generate assets (screenshots, audio, images)
 *   npm run generate:render     # Only render video (assumes assets exist)
 *
 * Environment variables:
 *   OPENAI_API_KEY     - Required for TTS voiceover generation
 *   SITE_URL           - Override site URL (default: https://eddy.guide)
 *   TTS_VOICE          - OpenAI TTS voice (default: onyx)
 *   SKIP_SCREENSHOTS   - Set to "true" to skip screenshot capture
 *   SKIP_TTS           - Set to "true" to skip voiceover generation
 *   SKIP_ASSETS_DL     - Set to "true" to skip mascot image downloads
 */

import path from "path";
import fs from "fs";
import { captureScreenshots } from "./steps/capture-screenshots";
import { downloadMascotAssets } from "./steps/download-assets";
import { generateVoiceover } from "./steps/generate-voiceover";
import { renderVideos } from "./steps/render-videos";

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

interface PipelineConfig {
  siteUrl: string;
  ttsVoice: string;
  openaiApiKey: string;
  publicDir: string;
  rootDir: string;
  assetsOnly: boolean;
  renderOnly: boolean;
  skipScreenshots: boolean;
  skipTts: boolean;
  skipAssetsDl: boolean;
}

function getConfig(): PipelineConfig {
  const args = process.argv.slice(2);
  const assetsOnly = args.includes("--assets-only");
  const renderOnly = args.includes("--render-only");

  return {
    siteUrl: process.env.SITE_URL || "https://eddy.guide",
    ttsVoice: process.env.TTS_VOICE || "onyx",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    publicDir: PUBLIC_DIR,
    rootDir: ROOT_DIR,
    assetsOnly,
    renderOnly,
    skipScreenshots: process.env.SKIP_SCREENSHOTS === "true",
    skipTts: process.env.SKIP_TTS === "true",
    skipAssetsDl: process.env.SKIP_ASSETS_DL === "true",
  };
}

async function main() {
  const config = getConfig();

  console.log("=== Eddy Video Tutorial Generator ===\n");
  console.log(`Site URL:    ${config.siteUrl}`);
  console.log(`TTS Voice:   ${config.ttsVoice}`);
  console.log(`Output:      ${config.rootDir}/out/\n`);

  // Ensure output directories exist
  const dirs = [
    path.join(config.publicDir, "screenshots"),
    path.join(config.publicDir, "eddy"),
    path.join(config.publicDir, "audio", "voiceover"),
    path.join(config.rootDir, "out"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!config.renderOnly) {
    // Step 1: Capture screenshots
    if (!config.skipScreenshots) {
      console.log("\n--- Step 1/4: Capturing screenshots from live site ---\n");
      await captureScreenshots(config.siteUrl, config.publicDir);
    } else {
      console.log("\n--- Step 1/4: Skipping screenshots (SKIP_SCREENSHOTS=true) ---\n");
    }

    // Step 2: Download mascot assets
    if (!config.skipAssetsDl) {
      console.log("\n--- Step 2/4: Downloading Eddy mascot assets ---\n");
      await downloadMascotAssets(config.publicDir);
    } else {
      console.log("\n--- Step 2/4: Skipping asset downloads (SKIP_ASSETS_DL=true) ---\n");
    }

    // Step 3: Generate voiceover
    if (!config.skipTts) {
      if (!config.openaiApiKey) {
        console.error("ERROR: OPENAI_API_KEY is required for TTS generation.");
        console.error("Set it via: export OPENAI_API_KEY=sk-...");
        console.error("Or skip TTS with: SKIP_TTS=true npm run generate");
        process.exit(1);
      }
      console.log("\n--- Step 3/4: Generating voiceover audio via OpenAI TTS ---\n");
      await generateVoiceover(config.publicDir, config.openaiApiKey, config.ttsVoice);
    } else {
      console.log("\n--- Step 3/4: Skipping TTS generation (SKIP_TTS=true) ---\n");
    }
  }

  if (!config.assetsOnly) {
    // Step 4: Render videos
    console.log("\n--- Step 4/4: Rendering videos via Remotion ---\n");
    await renderVideos(config.rootDir);
  }

  console.log("\n=== Pipeline complete! ===\n");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
