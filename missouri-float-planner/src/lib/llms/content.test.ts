import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import type { Database } from '@/types/database';
import robots, { CRAWLABLE_API_PATHS } from '../../app/robots';
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  conditionGlossary,
  LLMS_SECTIONS,
  type LlmsTxtOptions,
} from './content';
import { llmsFullResponse } from './full-response';

const BASE = 'https://eddy.guide';
const APP_DIR = path.join(process.cwd(), 'src', 'app');

const OPTIONS: LlmsTxtOptions = {
  baseUrl: BASE,
  x402Enabled: true,
  campingEnabled: true,
  floatSearchEnabled: true,
  lakes: [{ slug: 'table-rock', name: 'Table Rock Lake' }],
};

const LINK = /^- \[([^\]]+)\]\((\S+)\): \S.*$/;

/** Links in each H2 section of an llms.txt document, keyed by section title. */
function sectionLinks(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      current = [];
      sections.set(line.slice(3), current);
      continue;
    }
    if (!current || line === '') continue;
    const match = LINK.exec(line);
    assert.ok(match, `a section holds only "- [Title](url): note" lines, got: ${line}`);
    current.push(match[2]);
  }
  return sections;
}

function rules() {
  const all = robots().rules;
  const list = Array.isArray(all) ? all : [all];
  assert.equal(list.length, 1, 'one group, so no per-bot copy can drift from it');
  const [group] = list;
  assert.equal(group.userAgent, '*');
  return { allow: [group.allow ?? []].flat(), disallow: [group.disallow ?? []].flat() };
}

/** Longest matching rule wins and a tie goes to Allow, as crawlers resolve it. */
function crawlable(pathname: string): boolean {
  const { allow, disallow } = rules();
  const longest = (list: string[]) => Math.max(-1, ...list.filter((rule) => pathname.startsWith(rule)).map((rule) => rule.length));
  return longest(allow) >= longest(disallow);
}

/** Whether the app router has a page or route handler for a concrete path. */
function routeExists(pathname: string): boolean {
  let dir = APP_DIR;
  for (const segment of pathname.split('/').filter(Boolean)) {
    const literal = path.join(dir, segment);
    if (existsSync(literal)) { dir = literal; continue; }
    const dynamic = readdirSync(dir).find((name) => /^\[[^.\]]+\]$/.test(name));
    if (!dynamic) return false;
    dir = path.join(dir, dynamic);
  }
  return ['page.tsx', 'route.ts'].some((file) => existsSync(path.join(dir, file)));
}

test('robots.txt blocks only routes that exist and keeps the free endpoints open', () => {
  const { disallow } = rules();
  for (const rule of disallow) {
    assert.ok(existsSync(path.join(APP_DIR, rule)), `${rule} is disallowed but no such route exists`);
  }
  for (const pathname of ['/', '/rivers/missouri/current', '/blog/some-guide', '/embed', '/llms.txt', '/llms-full.txt']) {
    assert.ok(crawlable(pathname), pathname);
  }
  for (const pathname of ['/admin', '/api/rivers', '/api/plan', '/embed/widget/current']) {
    assert.ok(!crawlable(pathname), pathname);
  }
  for (const pathname of CRAWLABLE_API_PATHS) {
    assert.ok(crawlable(pathname), pathname);
    assert.ok(existsSync(path.join(APP_DIR, pathname)), `${pathname} is allowed but no such route exists`);
  }
});

test('llms.txt follows the llmstxt.org layout', () => {
  const lines = buildLlmsTxt(OPTIONS).split('\n');
  assert.match(lines[0], /^# \S/);
  assert.equal(lines.filter((line) => line.startsWith('# ')).length, 1);
  assert.equal(lines.filter((line) => line.startsWith('>')).length, 1, 'one blockquote summary');
  assert.ok(lines.indexOf(lines.find((line) => line.startsWith('>'))!) < lines.findIndex((line) => line.startsWith('## ')));

  const sections = sectionLinks(buildLlmsTxt(OPTIONS));
  assert.deepEqual([...sections.keys()], Object.values(LLMS_SECTIONS));
  for (const [title, links] of sections) {
    assert.ok(links.length > 0, `${title} has links`);
    for (const url of links) {
      assert.ok(url.startsWith(`${BASE}/`), url);
      assert.doesNotMatch(url, /[{}]/, 'a link target is a real URL, not a path template');
    }
  }
});

test('every llms.txt link resolves to a route, and the non-REST ones are crawlable', () => {
  const sections = sectionLinks(buildLlmsTxt(OPTIONS));
  for (const [title, links] of sections) {
    for (const url of links) {
      const { pathname } = new URL(url);
      assert.ok(routeExists(pathname), `${pathname} has no page or route handler`);
      // robots.txt and llms.txt must tell an agent the same thing: whatever
      // llms.txt offers outside the REST API is something a crawler may fetch.
      if (title !== LLMS_SECTIONS.rest) assert.ok(crawlable(pathname), `${pathname} is offered in llms.txt but disallowed in robots.txt`);
    }
  }
});

test('llms.txt lists launch-gated pages only once they are public', () => {
  const closed = buildLlmsTxt({ ...OPTIONS, campingEnabled: false, floatSearchEnabled: false, lakes: [] });
  for (const pathname of ['/camping', '/find-float', '/lakes/']) assert.ok(!closed.includes(`${BASE}${pathname}`), pathname);
  const open = buildLlmsTxt(OPTIONS);
  for (const pathname of ['/camping', '/find-float', '/lakes/table-rock']) assert.ok(open.includes(`(${BASE}${pathname})`), pathname);
});

test('both files report the configured x402 state', () => {
  for (const build of [buildLlmsTxt, (options: LlmsTxtOptions) => buildLlmsFullTxt({ ...options, rivers: [] })]) {
    assert.match(build({ ...OPTIONS, x402Enabled: true }), /x402 enforcement is enabled/);
    assert.match(build({ ...OPTIONS, x402Enabled: false }), /x402 enforcement is disabled/);
  }
});

test('the condition glossary carries the canonical meaning of every code', () => {
  const glossary = conditionGlossary();
  for (const code of Object.keys(CONDITION_SYSTEM) as ConditionCode[]) {
    const { label, description } = CONDITION_SYSTEM[code];
    assert.ok(glossary.includes(`- **${code}** (shown as "${label}"): ${description}`), code);
  }
  // The "Floatable now" count is narrower than "can be floated": low is rated
  // floatable with scraping, so the glossary must not call the count a verdict.
  assert.ok(glossary.includes('Eddy\'s "Floatable now" count includes only **good** and **flowing**. The other codes are not all "do not float"'));
  assert.doesNotMatch(glossary, /^Only .* floatable/m);
  assert.ok(glossary.indexOf('**good**') < glossary.indexOf('**flowing** ('), 'flowing sits above good on the ladder');
  assert.ok(buildLlmsFullTxt({ baseUrl: BASE, x402Enabled: false, rivers: [] }).includes(glossary));
});

test('llms-full.txt renders each river from the supplied data', () => {
  const text = buildLlmsFullTxt({
    baseUrl: BASE,
    x402Enabled: false,
    rivers: [
      { name: 'Current River', slug: 'current', path: '/rivers/missouri/current', lengthMiles: 184.04, difficulty: 'Class I-II', region: 'Ozarks', accessPointCount: 30, hazardCount: 0, conditionLabel: 'Good', description: 'Spring-fed.' },
      { name: 'Unrated Creek', slug: 'unrated', path: '/rivers/missouri/unrated', lengthMiles: null, difficulty: null, region: null, accessPointCount: 0, hazardCount: 2, conditionLabel: null, description: null },
    ],
  });
  assert.match(text, /## Rivers \(2 active\)/);
  assert.ok(text.includes('### Current River\n- Slug: current\n- URL: https://eddy.guide/rivers/missouri/current\n- API: https://eddy.guide/api/rivers/current\n- Length: 184.0 miles\n- Difficulty: Class I-II\n- Region: Ozarks\n- Access Points: 30\n- Current Condition: Good\n- Spring-fed.'));
  assert.ok(text.includes('### Unrated Creek\n- Slug: unrated\n- URL: https://eddy.guide/rivers/missouri/unrated\n- API: https://eddy.guide/api/rivers/unrated\n- Access Points: 0\n- Active Hazards: 2\n\n'));
  assert.ok(text.includes(`${BASE}/api/search?q={query}`));
});

/** A real client whose PostgREST calls are answered per table by `tables`. */
function clientWith(t: TestContext, tables: Record<string, unknown[] | null>) {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const rows = tables[url.pathname.split('/').pop()!];
    return rows === null
      ? new Response(JSON.stringify({ message: 'database unavailable' }), { status: 500 })
      : Response.json(rows ?? []);
  });
  const client = createClient<Database>('https://llms-test.supabase.co', 'test-only-key');
  return async () => client;
}

const RIVER_ROW = { id: 'r1', name: 'Current River', slug: 'current', state: 'MO', length_miles: 184, description: null, difficulty_rating: null, region: null };
const SITE = { baseUrl: BASE, x402Enabled: false };

function assertUnavailable(response: Response) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Retry-After'), '300');
}

test('llms-full.txt publishes the catalog when every query succeeds', async (t) => {
  const getClient = clientWith(t, { rivers: [RIVER_ROW], access_points: [{ id: 'a1', river_id: 'r1' }, { id: 'a2', river_id: 'r1' }] });
  const response = await llmsFullResponse(getClient, SITE);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=3600, s-maxage=3600');
  const text = await response.text();
  assert.match(text, /## Rivers \(1 active\)/);
  assert.ok(text.includes('### Current River\n- Slug: current\n- URL: https://eddy.guide/rivers/missouri/current'));
  assert.ok(text.includes('- Access Points: 2'));
});

// The original bug: a query that came back { data: null, error } was read as
// an empty table, so an outage published "Rivers (0 active)" or
// "Access Points: 0" and the CDN kept it for an hour.
for (const table of ['rivers', 'access_points', 'river_hazards', 'river_gauges']) {
  test(`llms-full.txt answers 503 when the ${table} query fails`, async (t) => {
    const errors = t.mock.method(console, 'error', () => {});
    const getClient = clientWith(t, { rivers: [RIVER_ROW], [table]: null });
    const response = await llmsFullResponse(getClient, SITE);
    assertUnavailable(response);
    assert.doesNotMatch(await response.text(), /active\)|Access Points/);
    assert.equal(errors.mock.calls[0].arguments[0], 'llms-full.txt unavailable:');
  });
}

test('the llms-full.txt route answers 503 when the database client cannot be built', async (t) => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  t.after(() => {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });
  const errors = t.mock.method(console, 'error', () => {});
  const { GET } = await import('../../app/llms-full.txt/route');
  const response = await GET();
  assertUnavailable(response);
  assert.equal(errors.mock.calls[0].arguments[0], 'llms-full.txt unavailable:');
});
