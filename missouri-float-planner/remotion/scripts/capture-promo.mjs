/**
 * Promo asset capture — pulls fresh screenshots (and a best-effort motion clip
 * of the live river map) from the live site for the 3-feature promo reel.
 *
 * Outputs:
 *   public/screenshots/promo/<name>.png            (landscape 1920x1080)
 *   public/screenshots/promo/<name>-portrait.png   (portrait  1080x1920)
 *   public/video/promo-map-portrait.mp4            (map pan/zoom screencast, if ffmpeg present)
 *
 * Usage:
 *   node scripts/capture-promo.mjs                 # screenshots + map clip
 *   SITE_URL=http://localhost:3000 node scripts/capture-promo.mjs
 *   SKIP_CLIP=true node scripts/capture-promo.mjs  # screenshots only
 */
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_URL = process.env.SITE_URL || "https://eddy.guide";
const SHOT_DIR = path.join(ROOT, "public", "screenshots", "promo");
const VIDEO_DIR = path.join(ROOT, "public", "video");
const SKIP_CLIP = process.env.SKIP_CLIP === "true";

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const TARGETS = [
  { name: "river-map", path: "/river-map", waitFor: "canvas", extraDelay: 9000 },
  { name: "gauges", path: "/gauges", waitFor: "main", extraDelay: 3500 },
  { name: "river-detail", path: "/rivers/current", waitFor: "canvas", extraDelay: 7000 },
  { name: "plan", path: "/plan", waitFor: "main", extraDelay: 5000 },
  {
    name: "plan-current",
    // Deep-linked, fully-computed plan: Akers Ferry -> Pulltite Spring on the
    // Current River (~9.6 mi) — the classic float, matches SectionGuide defaults.
    path: "/plan?river=current&putIn=2a0b22fa-9a08-4769-bc4f-5e831d67a0d0&takeOut=44241556-d384-44a7-851e-bad7b998a5bc",
    waitFor: "main",
    extraDelay: 9000,
  },
].filter((t) => !ONLY || ONLY.has(t.name));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function capturePage(page, url, out, viewport, target) {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  if (target.waitFor) {
    try {
      await page.waitForSelector(target.waitFor, { timeout: 12000 });
    } catch {
      console.warn(`  ! selector "${target.waitFor}" not found on ${url}, continuing`);
    }
  }
  if (target.extraDelay) await sleep(target.extraDelay);
  await page.screenshot({ path: out, type: "png", fullPage: false });
  console.log(`  ✓ ${path.basename(out)}`);
}

/**
 * Record a LANDSCAPE (16:9) screencast of the live map so the promo's map beat
 * shows the real thing moving — animated flow on the painted rivers plus a slow,
 * eased camera drift. Sized to cover the full map beat so no loop seam shows.
 * Frames -> ffmpeg -> public/video/promo-map.mp4. Best-effort (needs ffmpeg).
 *
 * Note: frames are grabbed as fast as headless can render them, so the map's
 * real-time flow animation plays back a little brisk — which reads as lively.
 * The camera drift is driven per-frame (not by wall-clock), so it stays smooth.
 */
async function captureMapClip(page) {
  const ffmpeg = process.env.FFMPEG || "ffmpeg";
  const hasFfmpeg = await new Promise((res) => {
    const p = spawn(ffmpeg, ["-version"]);
    p.on("error", () => res(false));
    p.on("exit", (c) => res(c === 0));
  });
  if (!hasFfmpeg) {
    console.warn("  ! ffmpeg not found — skipping map motion clip");
    return;
  }

  const FPS = 30;
  // Capture a shorter run of frames, then mirror it (forward+reverse) into a
  // seamless ~2x clip — the loop point matches exactly, so OffthreadVideo can
  // loop it under the map beat with no visible seam. Ken-Burns (in Remotion)
  // supplies the camera push-in; here we only need the live flow animation.
  const CAP = Number(process.env.CLIP_FRAMES || 165);
  const W = 1920, H = 1080;

  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`${SITE_URL}/river-map`, { waitUntil: "networkidle2", timeout: 45000 });
  try {
    await page.waitForSelector("canvas", { timeout: 12000 });
  } catch {
    console.warn("  ! no map canvas — skipping motion clip");
    return;
  }
  await sleep(9000); // let tiles + flow animation settle

  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-map-"));
  console.log(`  · recording ${CAP} map frames (static camera, live flow)…`);
  // No synthetic input — the painted rivers animate on their own, and mouse
  // drags time out on this heavy WebGL page. Just grab frames back to back.
  let shot = 0;
  for (let i = 0; i < CAP; i++) {
    try {
      await page.screenshot({ path: path.join(frameDir, `f${String(i).padStart(4, "0")}.png`), type: "png" });
      shot++;
    } catch (e) {
      console.warn(`  · frame ${i} skipped: ${e.message?.slice(0, 60)}`);
    }
  }
  if (shot < 10) throw new Error(`only ${shot} frames captured`);

  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const outMp4 = path.join(VIDEO_DIR, "promo-map.mp4");
  await new Promise((res, rej) => {
    const args = [
      "-y", "-framerate", String(FPS),
      "-i", path.join(frameDir, "f%04d.png"),
      // forward + reversed = seamless palindrome loop
      "-filter_complex", `[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,scale=${W}:${H}:flags=lanczos[out]`,
      "-map", "[out]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-r", String(FPS), outMp4,
    ];
    const p = spawn(ffmpeg, args, { stdio: "inherit" });
    p.on("error", rej);
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c))));
  });
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`  ✓ promo-map.mp4 (${W}x${H}, seamless palindrome)`);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`=== Promo capture from ${SITE_URL} ===`);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 120000, // heavy WebGL map page can stall CDP commands
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("cookieConsent", "true");
      localStorage.setItem("onboarding_complete", "true");
    });
    if (process.env.CLIP_ONLY === "true") {
      console.log("- map motion clip (CLIP_ONLY)");
      await captureMapClip(page);
      return;
    }
    for (const target of TARGETS) {
      const url = `${SITE_URL}${target.path}`;
      console.log(`- ${target.name} <- ${url}`);
      await capturePage(page, url, path.join(SHOT_DIR, `${target.name}.png`), { width: 1920, height: 1080 }, target);
      await capturePage(page, url, path.join(SHOT_DIR, `${target.name}-portrait.png`), { width: 1080, height: 1920 }, target);
    }
    if (!SKIP_CLIP) {
      console.log("- map motion clip");
      try {
        await captureMapClip(page);
      } catch (e) {
        console.warn("  ! map clip failed (non-fatal):", e.message);
      }
    }
  } finally {
    await browser.close();
  }
  console.log("=== done ===");
}

main().catch((e) => {
  console.error("capture failed:", e);
  process.exit(1);
});
