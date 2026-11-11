// scripts/check-dead-links.ts
// Playwright smoke test: crawl the app's internal links and fail on any that
// 404. This catches the bug class where a <Link> points at a route that
// doesn't exist — e.g. the five links to /gauges that had no index page.
//
// Needs a running server. Point it at one with BASE_URL (defaults to the local
// dev server). An absent default local server SKIPS (exit 0); an explicit
// unreachable target fails. Each run excludes analytics and logs its visits.
//
//   BASE_URL=https://preview.eddy.guide npm run test:links
//   BASE_URL=https://eddy.guide npm run audit:pages -- /about /support

import { chromium } from 'playwright';
import { createAuditBrowser } from './lib/audit-browser';

// Explicit paths/URLs check only those pages; no arguments run the bounded crawl.
const targets = process.argv.slice(2);
const BASE_URL = new URL(process.env.BASE_URL ||
  (targets[0]?.startsWith('https://') || targets[0]?.startsWith('http://') ? targets[0] : 'http://localhost:3000')).origin;
const SEEDS = ['/', '/rivers', '/plan', '/blog', '/about', '/gauges'];
const MAX_LINKS = 120; // bound crawl runtime

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'EddyAudit/1.0 (link-check-preflight)' } });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const seeds = targets.length ? targets.map(value => {
    const url = new URL(value, BASE_URL);
    if (url.origin !== BASE_URL || url.username || url.password) throw new Error('Audit URLs must share one origin and contain no credentials.');
    return url.pathname + url.search;
  }) : SEEDS;
  if (seeds.length > MAX_LINKS) throw new Error(`At most ${MAX_LINKS} audit URLs per run.`);
  if (!(await reachable(BASE_URL))) {
    if (targets.length || process.env.BASE_URL) throw new Error(`No server reachable at ${BASE_URL}`);
    console.log(`⚠ No server reachable at ${BASE_URL} — skipping dead-link check.`);
    console.log('  Start the app (npm run dev) or set BASE_URL to a deployed URL.');
    return;
  }

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const audit = await createAuditBrowser(browser, { name: 'link-check', baseURL: BASE_URL });
    const page = await audit.newPage();

    // Pass 1: gather same-origin links from the seed pages.
    const toCheck = new Set<string>(seeds);
    for (const seed of targets.length ? [] : seeds) {
      try {
        await page.goto(BASE_URL + seed, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') || ''));
        for (const href of hrefs) {
          if (toCheck.size >= MAX_LINKS) break;
          if (!href.startsWith('/') || href.startsWith('//') || new URL(href, BASE_URL).origin !== BASE_URL) continue;
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

    console.log(`Checked ${toCheck.size} internal link(s) against ${BASE_URL}.`);
    if (dead.length > 0) {
      console.error(`\n✖ ${dead.length} dead internal link(s):`);
      for (const d of dead) console.error(`  ${d.status || 'ERR'}  ${new URL(d.path, BASE_URL).pathname}`);
      process.exitCode = 1;
      return;
    }
    console.log('✓ No dead internal links.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Dead-link check failed to run:', err);
  process.exit(1);
});
