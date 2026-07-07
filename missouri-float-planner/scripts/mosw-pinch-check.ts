// One-off manual check that pinch-zoom actually changes the view. Runs
// against a dev server started by mosw-smoke's fixtures is overkill, so this
// just drives the live route with two touch pointers and reads the SVG
// viewBox before/after. Usage: npx tsx scripts/mosw-pinch-check.ts --url <base>
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

async function main() {
  const urlArg = process.argv.indexOf('--url');
  if (urlArg === -1) { console.error('pass --url <base>'); process.exit(2); }
  const target = `${process.argv[urlArg + 1]}/river-map`;
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // The map SVG is the one with a large viewBox (not the 24×24 lucide icons).
  const viewBoxOf = () =>
    page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg[viewBox]'));
      const map = svgs.find((s) => parseFloat((s.getAttribute('viewBox') || '0 0 0 0').split(/\s+/)[2]) > 100);
      return map?.getAttribute('viewBox') ?? null;
    });
  const before = await viewBoxOf();

  // Pinch out (zoom in): two fingers moving apart about the centre.
  const cdp = await ctx.newCDPSession(page);
  const pinch = async (fromGap: number, toGap: number) => {
    const cx = 195, cy = 430, steps = 8;
    for (let i = 0; i <= steps; i++) {
      const gap = fromGap + ((toGap - fromGap) * i) / steps;
      const type = i === 0 ? 'touchStart' : i === steps ? 'touchEnd' : 'touchMove';
      const points = i === steps ? [] : [
        { x: cx - gap / 2, y: cy, id: 0 }, { x: cx + gap / 2, y: cy, id: 1 },
      ];
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await page.waitForTimeout(30);
    }
  };
  await pinch(60, 260);
  await page.waitForTimeout(300);
  const after = await viewBoxOf();

  const w = (vb: string | null) => (vb ? parseFloat(vb.split(/\s+/)[2]) : NaN);
  const zoomedIn = w(after) < w(before) - 1;
  console.log(`viewBox before: ${before}`);
  console.log(`viewBox after : ${after}`);
  console.log(zoomedIn ? 'PASS pinch zoomed in (view width shrank)' : 'FAIL pinch did not change the view');
  await browser.close();
  process.exit(zoomedIn ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
