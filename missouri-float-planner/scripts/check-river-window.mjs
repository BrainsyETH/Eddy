import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Local fixtures only. No credentials or production river queries are needed.
const base = process.env.DISPLAY_TEST_BASE_URL || 'http://127.0.0.1:3200';
const output = process.env.DISPLAY_TEST_OUTPUT || '/tmp/eddy-river-window-check';
const fixture = {
  rivers: ['current', 'jacks-fork', 'eleven-point', 'huzzah', 'bryant-creek', 'north-fork-white'].map((slug, i) => ({
    id: slug,
    slug,
    name: ['Current River', 'Jacks Fork', 'Eleven Point', 'Huzzah Creek', 'Bryant Creek', 'North Fork River'][i],
    state: 'MO',
    currentCondition: {
      thresholdUnit: 'cfs',
      dischargeCfs: [1250, 480, 920, 230, 540, 870][i],
      gaugeHeightFt: 3.2,
      readingAgeHours: 0.25,
      code: 'good',
      trend: { direction: 'steady', label: 'Steady', windowHours: 6 },
    },
  })),
};
let server, browser;
try {
  if (!process.env.DISPLAY_TEST_BASE_URL) {
    server = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3200'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-browser-test-only',
        },
      }
    );
    let log = '';
    server.stdout.on('data', (chunk) => {
      log += chunk;
    });
    server.stderr.on('data', (chunk) => {
      log += chunk;
    });
    let ready = false;
    for (let i = 0; i < 180; i++) {
      if (server.exitCode != null) throw new Error(`Dev server exited: ${log.slice(-5000)}`);
      try {
        await fetch(`${base}/display/river-window/panorama.webp`, {
          signal: AbortSignal.timeout(1000),
        });
        ready = true;
        break;
      } catch {
        /* Starting. */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error(`Dev server timed out: ${log.slice(-5000)}`);
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/rivers', (route) => route.fulfill({ json: fixture }));
  await page.goto(`${base}/embed/display?theme=river`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
  await page.locator('[data-river="current"]').first().waitFor();
  assert.match(await page.locator('[data-river="current"]').first().innerText(), /1,250/);
  await page.evaluate(() => document.fonts.ready);
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'river-window-desktop.png') });
  const tile = page.locator('[data-river="current"]').first().locator('..');
  const before = await tile.getAttribute('style');
  await page.waitForTimeout(200);
  assert.equal(await tile.getAttribute('style'), before, 'Reduced motion must start paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
  assert.notEqual(await tile.getAttribute('style'), before, 'Play must advance the composition');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Next river' }).click();
  await page.locator('[data-river="jacks-fork"]').first().waitFor();
  await page.screenshot({ path: resolve(output, 'river-window-next.png') });
  await page.getByRole('button', { name: 'Readings', exact: true }).click();
  assert.equal(await page.getByRole('row').count(), 4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'river-window-mobile.png') });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'No horizontal page overflow'
  );
  await page.getByRole('button', { name: 'Close readings' }).click();
  await page.goto(`${base}/embed/display?theme=river&rivers=not-a-river&motion=off`);
  await page.getByText('No matching rivers in this selection').waitFor();
  assert.equal(await page.locator('[data-river="current"]').count(), 0);
  const failure = await browser.newPage({ reducedMotion: 'reduce' });
  await failure.route('**/api/rivers', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable' } })
  );
  await failure.goto(`${base}/embed/display?theme=river`);
  await failure
    .getByText('Readings unavailable · retrying automatically')
    .waitFor({ timeout: 20_000 });
  assert.equal(await failure.locator('[data-river="current"]').count(), 0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${base}/embed/display?motion=off`, { waitUntil: 'networkidle' });
  const names = ['Dillard Mill', 'Alley Mill', 'Klepzig Mill', 'Montauk Mill', 'Falling Spring Mill', 'Greer Mill', 'Turner Mill Site', 'Hodgson Mill', 'Dawt Mill', 'Rockbridge Mill'];
  const ids = ['dillard', 'alley', 'klepzig', 'montauk', 'falling', 'greer', 'turner', 'hodgson', 'dawt', 'rockbridge'];
  const slugs = ['huzzah', 'jacks-fork', 'current', 'current', 'eleven-point', 'eleven-point', 'eleven-point', 'bryant-creek', 'north-fork-white', 'bryant-creek'];
  await page.getByRole('button', { name: 'Mills', exact: true }).click();
  assert.equal(await page.getByRole('region', { name: 'Choose a mill' }).getByRole('button').count(), 10);
  for (let i = 0; i < ids.length; i++) {
    if (i) await page.getByRole('button', { name: 'Mills', exact: true }).click();
    await page.getByRole('region', { name: 'Choose a mill' }).getByRole('button', { name: names[i], exact: false }).click();
    const panel = page.locator(`[data-mill="${ids[i]}"]`).first();
    await panel.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0));
    const sign = panel.locator('[data-river]');
    assert.equal(await sign.getAttribute('data-river'), slugs[i]);
    assert.ok((await sign.innerText()).includes(names[i]));
    assert.equal(await sign.evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, `${ids[i]} sign must fit`);
    await page.mouse.move(960, 540);
    await page.screenshot({ path: resolve(output, `mill-${ids[i]}.png`) });
  }
  await page.getByRole('button', { name: 'Next mill' }).click();
  assert.match(await page.locator('[data-mill]').first().getAttribute('data-mill'), /dillard/);
  const millTile = page.locator('[data-mill="dillard"]').first();
  const still = await millTile.getAttribute('style');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
  assert.notEqual(await millTile.getAttribute('style'), still);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Readings', exact: true }).click();
  assert.equal(await page.getByRole('row').count(), 7);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(output, 'mill-mobile.png') });
  await page.goto(`${base}/embed/display?rivers=huzzah&motion=off`);
  assert.equal(await page.locator('[data-mill="alley"]').count(), 0);
  await page.locator('[data-mill="dillard"]').first().waitFor();
  await page.goto(`${base}/embed/display?rivers=missing&motion=off`);
  await page.getByText('No mill scenes match these rivers.').waitFor();
  await failure.goto(`${base}/embed/display?motion=off`);
  await failure.getByText('Readings unavailable · retrying automatically').waitFor({ timeout: 20_000 });
  assert.match(await failure.locator('[data-mill="dillard"] [data-river]').first().innerText(), /Reading unavailable/);
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(
    `PASS: route rendering, real asset loading, reduced motion, play/pause, next river, readable table, narrow viewport, invalid selection and unavailable API. Screenshots: ${output}`
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
