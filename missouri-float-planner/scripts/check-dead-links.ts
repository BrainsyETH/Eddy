// scripts/check-dead-links.ts
// Playwright smoke test: crawl the app's internal links and fail on any that
// 404. This catches the bug class where a <Link> points at a route that
// doesn't exist — e.g. the five links to /gauges that had no index page.
//
// Needs a running server. Point it at one with BASE_URL (defaults to the local
// dev server). If nothing is listening it SKIPS (exit 0) so CI without a server
// stays green; run it against a preview/deploy URL or `npm run dev`.
//
//   BASE_URL=https://preview.eddy.guide npm run test:links
//   npm run dev &  &&  npm run test:links

import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SEEDS = ['/', '/rivers', '/plan', '/blog', '/about', '/gauges'];
const MAX_LINKS = 120; // bound crawl runtime

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await reachable(BASE_URL))) {
    console.log(`⚠ No server reachable at ${BASE_URL} — skipping dead-link check.`);
    console.log('  Start the app (npm run dev) or set BASE_URL to a deployed URL.');
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Pass 1: gather same-origin links from the seed pages.
  const toCheck = new Set<string>(SEEDS);
  for (const seed of SEEDS) {
    try {
      await page.goto(BASE_URL + seed, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') || ''));
      for (const href of hrefs) {
        if (!href.startsWith('/') || href.startsWith('//')) continue; // same-origin paths only
        const path = href.split('#')[0].split('?')[0];
        if (path) toCheck.add(path);
        if (toCheck.size >= MAX_LINKS) break;
      }
    } catch {
      // A seed that fails to load is itself reported below when re-visited.
    }
  }

  // Pass 2: visit each unique path and record any that error.
  const dead: { path: string; status: number }[] = [];
  for (const path of Array.from(toCheck)) {
    try {
      const res = await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const status = res?.status() ?? 0;
      if (status >= 400) dead.push({ path, status });
    } catch {
      dead.push({ path, status: 0 });
    }
  }

  await browser.close();

  console.log(`Checked ${toCheck.size} internal link(s) against ${BASE_URL}.`);
  if (dead.length > 0) {
    console.error(`\n✖ ${dead.length} dead internal link(s):`);
    for (const d of dead) console.error(`  ${d.status || 'ERR'}  ${d.path}`);
    process.exit(1);
  }
  console.log('✓ No dead internal links.');
}

main().catch((err) => {
  console.error('Dead-link check failed to run:', err);
  process.exit(1);
});
