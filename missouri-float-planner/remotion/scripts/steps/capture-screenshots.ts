/**
 * Step 1: Capture real screenshots from the live site using Puppeteer.
 *
 * Captures both landscape (1920x1080) and portrait (1080x1920) screenshots
 * for each scene that needs them.
 */

import path from "path";
import puppeteer, { type Browser, type Page } from "puppeteer";

interface ScreenshotTarget {
  /** Output filename (without extension) */
  name: string;
  /** URL path relative to site root */
  path: string;
  /** Optional wait selector — wait for this element before capturing */
  waitFor?: string;
  /** Extra wait time in ms after page load (for maps, animations) */
  extraDelay?: number;
  /** Whether to also capture a vertical version */
  captureVertical?: boolean;
}

const TARGETS: ScreenshotTarget[] = [
  {
    name: "home",
    path: "/",
    waitFor: "main",
    extraDelay: 3000,
    captureVertical: true,
  },
  {
    name: "rivers-list",
    path: "/rivers",
    waitFor: "main",
    extraDelay: 2000,
    captureVertical: true,
  },
  {
    name: "river-detail",
    path: "/rivers/current",
    waitFor: "[class*='map']",
    extraDelay: 5000, // Maps need time to load tiles
    captureVertical: true,
  },
  {
    name: "float-planner",
    path: "/rivers/current",
    waitFor: "[class*='map']",
    extraDelay: 5000,
    captureVertical: true,
  },
  {
    name: "gauges",
    path: "/gauges",
    waitFor: "main",
    extraDelay: 3000,
    captureVertical: true,
  },
  {
    name: "access-point",
    path: "/rivers/current/access/akers-ferry",
    waitFor: "main",
    extraDelay: 2000,
    captureVertical: true,
  },
  {
    name: "share-plan",
    path: "/plan/demo",
    waitFor: "main",
    extraDelay: 3000,
    captureVertical: true,
  },
  {
    name: "ask-eddy",
    path: "/chat",
    waitFor: "main",
    extraDelay: 2000,
    captureVertical: true,
  },
];

async function capturePage(
  page: Page,
  url: string,
  outputPath: string,
  viewport: { width: number; height: number },
  target: ScreenshotTarget
): Promise<void> {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  if (target.waitFor) {
    try {
      await page.waitForSelector(target.waitFor, { timeout: 10000 });
    } catch {
      console.warn(`  Warning: Selector "${target.waitFor}" not found, proceeding anyway`);
    }
  }

  if (target.extraDelay) {
    await new Promise((r) => setTimeout(r, target.extraDelay));
  }

  await page.screenshot({
    path: outputPath,
    type: "png",
    fullPage: false, // Viewport-size only
  });
}

export async function captureScreenshots(
  siteUrl: string,
  publicDir: string
): Promise<void> {
  const screenshotDir = path.join(publicDir, "screenshots");
  let browser: Browser | null = null;

  try {
    console.log("Launching Puppeteer...");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Dismiss any cookie banners / modals
    await page.evaluateOnNewDocument(() => {
      window.localStorage.setItem("cookieConsent", "true");
      window.localStorage.setItem("onboarding_complete", "true");
    });

    for (const target of TARGETS) {
      const url = `${siteUrl}${target.path}`;

      // Landscape (1920x1080)
      const landscapePath = path.join(screenshotDir, `${target.name}.png`);
      console.log(`  Capturing ${target.name} (landscape) -> ${url}`);
      await capturePage(page, url, landscapePath, { width: 1920, height: 1080 }, target);

      // Portrait (1080x1920) for TikTok
      if (target.captureVertical) {
        const verticalPath = path.join(screenshotDir, `${target.name}-vertical.png`);
        console.log(`  Capturing ${target.name} (portrait) -> ${url}`);
        await capturePage(page, url, verticalPath, { width: 1080, height: 1920 }, target);
      }
    }

    console.log(`\nCaptured ${TARGETS.length} screenshots (landscape + portrait)`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
