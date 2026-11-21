// Called by workspace-smoke.mjs. The visual guide gallery is read in both color
// schemes; its headings must follow the gallery's own ink, not the admin shell's.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdir } from 'node:fs/promises';

export async function checkVisualGuidesGallery(browser, origin, out, secret) {
  const guides = (await readdir('content/admin-visuals')).filter((file) => file.endsWith('.html')).length;
  const expiry = Date.now() + 60 * 60 * 1000;
  const token = `${expiry}.${createHmac('sha256', secret).update(`admin:${expiry}`).digest('hex')}`;
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme });
      await context.addCookies([{ name: 'mfp_admin_session', value: token, url: origin }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(origin + '/admin/visuals');
        await page.getByRole('heading', { level: 1, name: 'Visual guides' }).waitFor();
        assert.equal(await page.locator('a[href^="/admin/visuals/"][href$=".html"]').count(), guides + 1, 'start link plus one card per guide');
        const unreadable = await page.evaluate(() => {
          const rgb = (value) => value.match(/[\d.]+/g).map(Number);
          const luminance = ([r, g, b]) => [r, g, b]
            .map((channel) => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
            .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          const background = (element) => {
            for (let node = element; node; node = node.parentElement) {
              const color = getComputedStyle(node).backgroundColor;
              if (rgb(color)[3] !== 0) return color;
            }
            return 'rgb(255, 255, 255)';
          };
          return [...document.querySelectorAll('h1, h2, h3')].flatMap((heading) => {
            const [a, b] = [luminance(rgb(getComputedStyle(heading).color)), luminance(rgb(background(heading)))];
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            return ratio < 4.5 ? [`${heading.textContent.trim()} (${ratio.toFixed(2)}:1)`] : [];
          });
        });
        assert.deepEqual(unreadable, [], `gallery headings readable in ${colorScheme} at ${width}px`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `gallery fits ${width}px`);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${out}/visual-guides-${colorScheme}-${width}.png`, fullPage: true });
      } finally {
        await context.close();
      }
    }
  }
}
