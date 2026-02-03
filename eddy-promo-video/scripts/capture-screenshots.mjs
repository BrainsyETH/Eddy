/**
 * Screenshot Capture Script for Eddy Promo Video
 *
 * Captures screenshots from eddy.guide for use in the promo video.
 * Run with: npm run capture
 */

import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, "../public/screenshots");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const SCREENSHOTS = [
  {
    name: "homepage.png",
    url: "https://eddy.guide",
    viewport: { width: 1920, height: 1080 },
    waitFor: 2000,
  },
  {
    name: "gauges.png",
    url: "https://eddy.guide/gauges",
    viewport: { width: 1920, height: 1080 },
    waitFor: 3000,
  },
  {
    name: "river-putin.png",
    url: "https://eddy.guide",
    viewport: { width: 1920, height: 1080 },
    waitFor: 2000,
    // Capture with a river selected
    actions: async (page) => {
      // Click on the map area or wait for content to load
      await page.waitForSelector('[data-testid="map"]', { timeout: 5000 }).catch(() => {});
    },
  },
  {
    name: "river-takeout.png",
    url: "https://eddy.guide",
    viewport: { width: 1920, height: 1080 },
    waitFor: 2000,
  },
];

async function captureScreenshots() {
  console.log("🚀 Launching browser...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const screenshot of SCREENSHOTS) {
      console.log(`📸 Capturing ${screenshot.name}...`);

      const page = await browser.newPage();
      await page.setViewport(screenshot.viewport);

      await page.goto(screenshot.url, { waitUntil: "networkidle2" });

      // Run custom actions if defined
      if (screenshot.actions) {
        await screenshot.actions(page);
      }

      // Wait for content to render
      await new Promise((r) => setTimeout(r, screenshot.waitFor));

      // Capture screenshot
      const outputPath = join(OUTPUT_DIR, screenshot.name);
      await page.screenshot({ path: outputPath, type: "png" });

      console.log(`   ✅ Saved to ${outputPath}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log("\n🎉 All screenshots captured!");
  console.log(`   Output: ${OUTPUT_DIR}`);
}

captureScreenshots().catch(console.error);
