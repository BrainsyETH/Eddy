// src/lib/gauges/search-overloads.test.ts
// The one thing about search_gauges that cannot be checked by reading it.
//
// ── Why a test and not another comment ─────────────────────────────────────
//
// public.search_gauges exists in two overloads on purpose: a 5-arg paged form
// for /api/search, and a 4-arg compatibility form for the callers that pass
// only `{p_query, p_limit}` — which today means /api/gauges/[siteId], the
// route behind every gauge sheet in the app.
//
// PostgREST picks between them BY ARGUMENT NAME, keeping a candidate only when
// every parameter the caller omitted has a default. So the pair is resolvable
// only while p_offset has no default:
//
//   {p_query, p_limit}            -> the 4-arg form only; the 5-arg needs
//                                    p_offset, so it is not a candidate
//   {p_query, p_limit, p_offset}  -> the 5-arg form only; the 4-arg has no
//                                    parameter by that name
//
// Give p_offset a default and a two-argument call matches both. PostgREST
// refuses to choose and fails the request (PGRST203), /api/gauges/[siteId]
// answers 500 for every station, and — this is the part that makes it worth a
// test rather than a warning — the app does not show an error. Its Levels tab
// reads `thresholds` off the response it never got and says "Eddy has not
// rated this station against a river yet", under a pin already wearing the
// verdict that ladder produced.
//
// 00207 wrote the invariant down. 20260811130000 restated it in a 25-line
// comment block. 20260816233337 then broke it anyway, in a migration whose
// actual subject was a row clamp, because restating a signature is how you
// touch a default without meaning to. A comment cannot fail a build; this can.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const MIGRATIONS = path.resolve(process.cwd(), 'supabase/migrations');

/** SQL line comments, gone — this file's own prose says `default 0` in one. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

interface Declaration {
  file: string;
  params: string[];
}

/**
 * Every `create [or replace] function public.search_gauges(...)` in migration
 * order, with its parameter list split out.
 *
 * The parameter list never nests parentheses — types are `text`, `integer`,
 * `double precision` — so stopping at the first `)` is exact rather than
 * approximate.
 */
function declarations(): Declaration[] {
  const found: Declaration[] = [];

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripComments(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    const pattern = /create\s+(?:or\s+replace\s+)?function\s+public\.search_gauges\s*\(([^)]*)\)/gi;

    for (const match of sql.matchAll(pattern)) {
      const params = match[1]
        .split(',')
        .map((p) => p.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
      found.push({ file, params });
    }
  }

  return found;
}

/** The last word on a signature is the one the database is running. */
function latestWith(count: number): Declaration | null {
  const matching = declarations().filter((d) => d.params.length === count);
  return matching.length ? matching[matching.length - 1] : null;
}

test('the migrations really do declare search_gauges', () => {
  // Guards the guard: a regex that quietly matched nothing would pass every
  // assertion below forever.
  assert.ok(
    declarations().length >= 2,
    'expected to find search_gauges declarations in supabase/migrations',
  );
});

test('p_offset carries no default, or a two-argument call cannot resolve', () => {
  const paged = latestWith(5);
  assert.ok(paged, 'no 5-argument search_gauges found');

  const offset = paged.params.find((p) => p.startsWith('p_offset'));
  assert.ok(offset, `the 5-argument form has no p_offset: ${paged.params.join(', ')}`);

  assert.doesNotMatch(
    offset,
    /default/i,
    `${paged.file} gives p_offset a default. That makes {p_query, p_limit} match ` +
      `both overloads, PostgREST answers PGRST203, and /api/gauges/[siteId] — the ` +
      `route behind every gauge sheet — 500s for every station. Add a separately ` +
      `named function instead.`,
  );
});

test('the compatibility overload the two-argument callers need still exists', () => {
  // Dropping it is the other way to break the same callers: with only the
  // 5-arg form live, `{p_query, p_limit}` names no candidate at all and
  // PostgREST answers PGRST202. /api/search retries unpaged on exactly this
  // failure, so it would degrade quietly while the gauge route did not.
  const compat = latestWith(4);
  assert.ok(compat, 'no 4-argument search_gauges found');
  assert.ok(
    compat.params.some((p) => p.startsWith('p_limit')),
    `the 4-argument form must take p_limit: ${compat.params.join(', ')}`,
  );
  assert.ok(
    !compat.params.some((p) => p.startsWith('p_offset')),
    'the 4-argument form must not name p_offset — that is what tells the two apart',
  );
});

test('the gauge detail route is still the caller this protects', () => {
  // The invariant only matters while something calls with two named arguments.
  // If this route ever starts passing p_offset, the pair stops needing to be
  // resolvable and this file should be deleted rather than worked around.
  const route = readFileSync(
    path.resolve(process.cwd(), 'src/app/api/gauges/[siteId]/route.ts'),
    'utf8',
  );
  const call = route.match(/rpc\(\s*'search_gauges'\s*,\s*\{([^}]*)\}/);

  assert.ok(call, '/api/gauges/[siteId] no longer calls search_gauges by name');
  assert.match(call[1], /p_query/);
  assert.match(call[1], /p_limit/);
  assert.doesNotMatch(
    call[1],
    /p_offset/,
    'this route now names p_offset — see this test\'s header before relaxing anything',
  );
});
