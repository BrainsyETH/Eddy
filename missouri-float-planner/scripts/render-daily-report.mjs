import { chromium } from 'playwright';
import { put } from '@vercel/blob';

const postIds = (process.env.POST_IDS ?? '').split(',');
if (!postIds.length || postIds.length > 2 || postIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Invalid post IDs');
const origin = new URL(process.env.SITE_URL || 'https://eddy.guide').origin;
if (!origin.startsWith('https://')) throw new Error('SITE_URL must use HTTPS');
if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is required');
const exportPath = `/embed/report/${postIds[0]}/`;

async function callback(body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${origin}/api/admin/social/carousel-callback`, {
        method: 'POST', signal: AbortSignal.timeout(180_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ postIds: postIds.join(','), ...body }),
      });
      if (response.ok) return;
      if (response.status < 500) throw new Error(`Callback rejected: HTTP ${response.status}`);
    } catch (error) { if (attempt === 2) throw error; }
  }
  throw new Error('Carousel callback failed');
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  // Send the machine credential only to our export page, never fonts, images,
  // redirects, analytics, or another origin loaded by the real widget.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const headers = { ...route.request().headers() };
    if (url.origin === origin && url.pathname.startsWith(exportPath)) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    else delete headers.authorization;
    await route.continue({ headers });
  });
  const imageUrls = [];
  let count = 2;
  let capturedAt;
  for (let index = 0; index < count; index++) {
    const response = await page.goto(`${origin}${exportPath}${index}`, { waitUntil: 'networkidle', timeout: 90_000 });
    if (!response?.ok()) throw new Error(`Export page failed: HTTP ${response?.status()}`);
    const slide = page.locator('[data-report-slide]');
    await slide.waitFor();
    const nextCount = Number(await slide.getAttribute('data-slide-count'));
    const nextCaptured = await slide.getAttribute('data-captured-at');
    if (nextCount < 2 || nextCount > 5 || !Number.isInteger(nextCount) || !nextCaptured) throw new Error('Invalid export manifest');
    if (index && (count !== nextCount || capturedAt !== nextCaptured)) throw new Error('Snapshot changed during capture');
    count = nextCount; capturedAt = nextCaptured;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('[data-report-slide] img')].map(img => img.decode()));
    });
    const fits = await slide.evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.scrollHeight <= el.clientHeight && [...el.querySelectorAll('*')].every(child => {
        const r = child.getBoundingClientRect();
        return r.width === 0 || (r.left >= box.left - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1);
      });
    });
    if (!fits) throw new Error(`Slide ${index + 1} overflows; refusing to crop the widget`);
    const bytes = await slide.screenshot({ type: 'jpeg', quality: 95, animations: 'disabled' });
    const blob = await put(`daily-reports/${postIds[0]}/slide-${index + 1}.jpg`, bytes, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true });
    imageUrls.push(blob.url);
  }
  await callback({ status: 'rendered', capturedAt, imageUrls });
  console.log(`Rendered ${imageUrls.length} Daily Report slides.`);
} catch (error) {
  await callback({ status: 'failed' }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
}
