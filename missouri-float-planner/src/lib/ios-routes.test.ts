import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// Does every route the iOS app navigates to actually exist?
//
// ── Why this is a test and not a type ───────────────────────────────────────
//
// app.json sets `experiments.typedRoutes`, so expo-router generates the union of
// every route into .expo/types/router.d.ts and router.push() accepts only its
// members. That is a better check than this one — where it runs. It does not
// run here: the declaration is written ONLY by the dev server, is gitignored,
// and is never generated in CI. `expo export` does not write it either, which
// was tried. See eddy-ios/src/lib/href.ts.
//
// So CI has no declaration and route errors cannot fire, while a laptop has
// whatever its last `expo start` wrote and a newly added route reads as
// invalid. Both failure modes are the same missing artifact, and neither is
// fixable from CI.
//
// This test needs no Expo, no dev server and no generated file — just the two
// things already in git: the route files, and the pushes. Same arrangement as
// entitlement-id.test.ts and the bundle parity tests, and for the same reason:
// the app has no test runner, so anything that can be checked is checked here.

const APP = '../eddy-ios/app';
const SOURCE_DIRS = ['../eddy-ios/app', '../eddy-ios/src'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/**
 * Every route the app declares, as expo-router derives it from the file tree.
 *
 * The rules that matter, and each one is load-bearing for a real path in this
 * app:
 *
 *   _layout        not a route — it wraps them
 *   +native-intent not a route — the `+` prefix is expo-router's escape hatch
 *   (tabs)         a GROUP, and groups are transparent in the URL. This is why
 *                  app/(tabs)/reports.tsx answers to `/reports` and why
 *                  dropping the parens instead of the whole segment would be
 *                  wrong.
 *   index          maps to its directory, so app/(tabs)/index.tsx is `/`
 *   [slug]         kept verbatim; matched structurally against template pushes
 */
function declaredRoutes(): string[] {
  return walk(APP)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => relative(APP, file).replace(/\.tsx?$/, ''))
    .filter((route) => {
      const segments = route.split('/');
      return !segments.some((s) => s === '_layout' || s.startsWith('+'));
    })
    .map((route) => {
      const segments = route
        .split('/')
        .filter((s) => !/^\(.*\)$/.test(s)); // groups vanish from the URL
      if (segments[segments.length - 1] === 'index') segments.pop();
      return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
    });
}

/**
 * Comments are stripped BEFORE scanning, and that is not defensive tidiness.
 *
 * href.ts's own header contains router.push(`/river/${slug}`) as prose, and
 * app/(tabs)/reports.tsx discusses '/reports' mid-sentence. A regex over raw
 * source matches both and would have this test assert against documentation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every route literal the app actually navigates to. */
function pushedRoutes(): { route: string; file: string }[] {
  const found: { route: string; file: string }[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(dir)) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = stripComments(readFileSync(file, 'utf8'));

      // router.push('/x') / .replace(`/x/${y}`) / .navigate("/x")
      for (const m of source.matchAll(
        /router\.(?:push|replace|navigate)\(\s*['"`](\/[^'"`]*)['"`]/g,
      )) {
        found.push({ route: m[1], file });
      }
      // The object form: router.push({ pathname: '/x', params })
      for (const m of source.matchAll(/pathname:\s*['"`](\/[^'"`]*)['"`]/g)) {
        found.push({ route: m[1], file });
      }
    }
  }
  return found;
}

/**
 * Does a pushed path reach a declared route?
 *
 * Segment-wise rather than by string equality, because a template literal
 * arrives here as `/river/${slug}` and has to match the declared `/river/[slug]`
 * — same shape, different notation. A dynamic segment on the route side accepts
 * any single segment; everything else must match exactly.
 */
function resolves(pushed: string, routes: string[]): boolean {
  const want = pushed.split('/').filter(Boolean);
  return routes.some((route) => {
    const have = route.split('/').filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((segment, i) => {
      if (/^\[.*\]$/.test(segment)) return true; // [slug] takes anything
      return segment === want[i];
    });
  });
}

test('the app declares the routes it is built around', () => {
  const routes = declaredRoutes();
  // A sanity floor. If the walk silently found nothing — wrong cwd, renamed
  // directory — every other assertion below would pass vacuously.
  assert.ok(routes.length > 10, `only found ${routes.length} routes`);
  for (const expected of ['/', '/alerts', '/profile', '/reports', '/floats', '/storage']) {
    assert.ok(routes.includes(expected), `expected a route at ${expected}`);
  }
});

test('route groups do not appear in the path', () => {
  // app/(tabs)/reports.tsx answers to /reports. Getting this wrong would make
  // every tab route unreachable and the test would say so about the wrong file.
  const routes = declaredRoutes();
  assert.equal(routes.some((r) => r.includes('(')), false, 'a group leaked into a path');
  assert.ok(routes.includes('/'), 'app/(tabs)/index.tsx should be /');
});

test('layouts and +native-intent are not routes', () => {
  const routes = declaredRoutes();
  assert.equal(routes.some((r) => r.includes('_layout')), false);
  assert.equal(routes.some((r) => r.includes('native-intent')), false);
});

test('every route the app pushes actually exists', () => {
  // THE POINT OF THIS FILE. A push to a screen that was renamed, moved or never
  // added is invisible to CI — typed routes cannot fire there — and reaches a
  // user as a dead tap.
  const routes = declaredRoutes();
  const pushes = pushedRoutes();

  assert.ok(pushes.length > 5, `only found ${pushes.length} pushes — did the scan break?`);

  const broken = pushes.filter(({ route }) => !resolves(route, routes));
  assert.deepEqual(
    broken.map(({ route, file }) => `${route} (${file})`),
    [],
    'these pushes name no route file',
  );
});

test('a push to a route that does not exist is caught', () => {
  // Proves the check above can fail. Without this, a broken matcher that
  // resolved everything would pass silently and protect nothing.
  const routes = declaredRoutes();
  assert.equal(resolves('/storage', routes), true);
  assert.equal(resolves('/not-a-screen', routes), false);
  assert.equal(resolves('/river/current', routes), true, 'dynamic segment should match');
  assert.equal(resolves('/river/current/nope', routes), false, 'arity must matter');
});

test('documentation that mentions a route is not read as a push', () => {
  // href.ts and reports.tsx both discuss routes in prose. Before comments were
  // stripped, this test asserted against its own documentation.
  const stripped = stripComments(`
    // router.push('/definitely-not-a-route')
    /* router.push('/also-not-one') */
    const real = () => router.push('/storage');
  `);
  assert.equal(stripped.includes('definitely-not-a-route'), false);
  assert.equal(stripped.includes('also-not-one'), false);
  assert.equal(stripped.includes('/storage'), true);
});

test('a URL in a string is not mistaken for a comment', () => {
  // The `//` in https:// would eat the rest of the line if the stripper were
  // naive, silently hiding real pushes that follow it.
  const stripped = stripComments(`const u = 'https://eddy.guide'; router.push('/storage');`);
  assert.ok(stripped.includes('/storage'), 'a push after a URL must survive stripping');
});
