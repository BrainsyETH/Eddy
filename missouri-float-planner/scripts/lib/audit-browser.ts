// Shared browser setup for checks that can visit a real deployment.
// Analytics fixtures intentionally use raw Playwright with all traffic stubbed.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContextOptions, Request } from 'playwright';
import { ANALYTICS_OPT_OUT_KEY } from '../../src/lib/analytics';

const EDDY_HOSTS = new Set(['eddy.guide', 'www.eddy.guide']);

function measurementRequest(url: URL, origin: string): boolean {
  const host = url.hostname;
  const google = ['google-analytics.com', 'googletagmanager.com', 'analytics.google.com']
    .some(domain => host === domain || host.endsWith(`.${domain}`));
  const local = url.origin === origin || EDDY_HOSTS.has(host);
  return google || (host === 'www.google.com' && ['/g/collect', '/ccm/collect'].includes(url.pathname)) ||
    (local && (url.pathname === '/api/embed/impression' || url.pathname.startsWith('/_vercel/insights/')));
}

// Never persist query values, fragments, URL credentials, cookies or headers.
function reportUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) return '[non-http URL]';
  return `${url.origin}${url.pathname}`;
}

export async function createAuditBrowser(browser: Browser, {
  name,
  baseURL,
  outputDir = process.env.EDDY_AUDIT_OUTPUT || 'tmp/audits',
}: { name: string; baseURL: string; outputDir?: string }) {
  if (!/^[a-z0-9-]{1,60}$/.test(name)) throw new Error('Use a short lowercase audit name.');
  const target = new URL(baseURL);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Audit URL must be HTTP(S), without credentials.');
  }
  const origin = target.origin;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  mkdirSync(outputDir, { recursive: true });
  const logPath = path.resolve(outputDir, `${startedAt.replace(/[:.]/g, '-')}-${name}-${runId}.jsonl`);
  writeFileSync(logPath, '', { flag: 'wx', mode: 0o600 });
  const record = (event: string, details: Record<string, unknown> = {}) => {
    appendFileSync(logPath, JSON.stringify({ time: new Date().toISOString(), runId, event, ...details }) + '\n');
  };
  record('start', { name, origin, timezone: 'UTC', commit: process.env.GITHUB_SHA || null });
  console.log(`Audit ${name}: ${runId}\nVisit log: ${logPath}`);
  browser.once('disconnected', () => record('browser_closed'));

  // Preserve the installed browser's real version and any caller device UA.
  const probe = await browser.newContext();
  let defaultUserAgent: string;
  try {
    const blank = await probe.newPage();
    defaultUserAgent = await blank.evaluate(() => navigator.userAgent);
  } finally {
    await probe.close();
  }
  let contextCount = 0;
  let requestCount = 0;
  async function newContext(options: BrowserContextOptions = {}) {
    const contextId = ++contextCount;
    const context = await browser.newContext({
      ...options,
      serviceWorkers: 'block',
      userAgent: `${options.userAgent || defaultUserAgent} EddyAudit/1.0 (${name}; run=${runId})`,
    });
    try {
      await context.addInitScript(({ key, origin }) => {
        if (location.origin !== origin && !['eddy.guide', 'www.eddy.guide'].includes(location.hostname)) return;
        try { sessionStorage.setItem(key, '1'); } catch { /* Network blocking remains active. */ }
      }, { key: ANALYTICS_OPT_OUT_KEY, origin });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (measurementRequest(url, origin)) {
          record('measurement_blocked', { contextId, url: reportUrl(url.href) });
          await route.abort('blockedbyclient');
        } else {
          await route.fallback();
        }
      });
      const requests = new WeakMap<Request, number>();
      context.on('request', request => {
        if (!request.isNavigationRequest()) return;
        const requestId = ++requestCount;
        requests.set(request, requestId);
        record('request', { contextId, requestId, method: request.method(), url: reportUrl(request.url()),
          redirectedFrom: request.redirectedFrom() ? requests.get(request.redirectedFrom()!) ?? null : null });
      });
      context.on('response', response => {
        const requestId = requests.get(response.request());
        if (requestId) record('response', { contextId, requestId, url: reportUrl(response.url()), status: response.status() });
      });
      context.on('requestfailed', request => {
        const requestId = requests.get(request);
        if (requestId) record('request_failed', { contextId, requestId, url: reportUrl(request.url()) });
      });
      context.on('page', page => page.on('framenavigated', frame => {
        if (!/^https?:/.test(frame.url())) return;
        record('navigation', { contextId, url: reportUrl(frame.url()), mainFrame: frame === page.mainFrame() });
      }));
      return context;
    } catch (error) {
      await context.close();
      throw error;
    }
  }
  async function newPage(options: BrowserContextOptions = {}) {
    const context = await newContext(options);
    const page = await context.newPage();
    // Match browser.newPage's ownership: closing this page closes its context.
    page.once('close', () => { void context.close(); });
    return page;
  }
  return { runId, logPath, newContext, newPage };
}
