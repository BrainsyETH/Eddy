#!/usr/bin/env node

/**
 * Export ad creative HTML files to PNG images for Facebook Ads Manager upload.
 *
 * Usage: node scripts/export-ads.js
 *
 * Requires: playwright (npx playwright)
 * Output: .stitch/ads/*.png
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ADS = [
  { file: '11-ad-conditions-fb-feed.html', output: 'ad-conditions-fb-feed.png', width: 1200, height: 628 },
  { file: '12-ad-conditions-ig-feed.html', output: 'ad-conditions-ig-feed.png', width: 1080, height: 1080 },
  { file: '13-ad-conditions-ig-story.html', output: 'ad-conditions-ig-story.png', width: 1080, height: 1920 },
  { file: '14-ad-lifestyle-fb-feed.html', output: 'ad-lifestyle-fb-feed.png', width: 1200, height: 628 },
  { file: '15-ad-lifestyle-ig-feed.html', output: 'ad-lifestyle-ig-feed.png', width: 1080, height: 1080 },
  { file: '16-ad-lifestyle-ig-story.html', output: 'ad-lifestyle-ig-story.png', width: 1080, height: 1920 },
];

const DESIGNS_DIR = path.join(__dirname, '..', '.stitch', 'designs');
const OUTPUT_DIR = path.join(__dirname, '..', '.stitch', 'ads');

async function exportAds() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  for (const ad of ADS) {
    const htmlPath = path.join(DESIGNS_DIR, ad.file);
    if (!fs.existsSync(htmlPath)) {
      console.log(`  SKIP: ${ad.file} not found`);
      continue;
    }

    const page = await browser.newPage();
    await page.setViewportSize({ width: ad.width, height: ad.height });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 60000 });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);

    const outputPath = path.join(OUTPUT_DIR, ad.output);
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: ad.width, height: ad.height },
    });

    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(0);
    console.log(`  OK: ${ad.output} (${ad.width}x${ad.height}, ${sizeKB} KB)`);

    await page.close();
  }

  await browser.close();
  console.log(`\nDone! PNGs saved to: ${OUTPUT_DIR}`);
  console.log('Upload these files directly to Facebook Ads Manager.');
}

exportAds().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
