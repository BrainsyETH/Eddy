// src/lib/navigation/apple-app-site-association.test.ts
// Universal links fail silently in every direction, which is what this guards.
//
// A wrong Team ID, a claimed path with no app route, a redirect on the
// well-known URL — none of them produce an error anywhere. The domain
// association just quietly does not happen, or the app opens to a 404, and the
// only signal is a person saying "it opens in Safari for me". Apple's CDN
// caches the file too, so a mistake outlives the fix.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_ID,
  APPLE_TEAM_ID,
  CLAIMED_PATHS,
  IOS_BUNDLE_ID,
  appleAppSiteAssociation,
} from './apple-app-site-association';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const APP_JSON = join(process.cwd(), '..', 'eddy-ios', 'app.json');
const NATIVE_INTENT = join(process.cwd(), '..', 'eddy-ios', 'app', '+native-intent.tsx');

test('the appID is the Team ID and the bundle id, in that order', () => {
  // Reversed or separated by anything but a dot, iOS declines the association
  // and reports nothing.
  assert.equal(APP_ID, `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`);
  assert.match(APP_ID, /^[A-Z0-9]{10}\.[a-z0-9.]+$/);
});

test('the bundle id matches the one the app actually ships', () => {
  // These live in two repos-worth of config and are compared by Apple, not by
  // any build step here.
  const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
  assert.equal(IOS_BUNDLE_ID, appJson.expo.ios.bundleIdentifier);
});

test('the app claims the same domain the site serves', () => {
  const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
  assert.deepEqual(appJson.expo.ios.associatedDomains, ['applinks:eddy.guide']);
});

test('every claimed path has a route in the app to receive it', () => {
  // A claimed path with no mapping opens the app to a 404 — strictly worse than
  // not claiming it, because Safari at least rendered the page. The web URL and
  // the app route genuinely differ here (/plan/:code vs /float/:code), so this
  // cannot be assumed from the path alone.
  const intent = readFileSync(NATIVE_INTENT, 'utf8');
  for (const path of CLAIMED_PATHS) {
    const prefix = path.replace(/\/\*$/, '');
    assert.ok(
      intent.includes(prefix),
      `${path} is claimed but +native-intent.tsx does not mention ${prefix}`,
    );
  }
});

test('the planner page itself is not claimed', () => {
  // /plan is a web tool; only its saved RESULTS have an app screen. The glob
  // requires a segment after /plan/, so the bare page still opens in a browser.
  const paths = appleAppSiteAssociation().applinks.details[0].components.map((c) => c['/']);
  assert.ok(!paths.includes('/plan'));
  assert.ok(paths.includes('/plan/*'));
});

test('the well-known URL is rewritten, never redirected', () => {
  // Apple's CDN does not follow redirects when fetching this file. A 3xx is an
  // instant, silent failure — and next.config.mjs already redirects other
  // paths, so this is a live hazard rather than a hypothetical one.
  const config = read('next.config.mjs');
  const wellKnown = '/.well-known/apple-app-site-association';

  const rewrites = config.slice(config.indexOf('async rewrites()'), config.indexOf('async redirects()'));
  assert.ok(rewrites.includes(wellKnown), 'the well-known path must be rewritten');

  const redirects = config.slice(config.indexOf('async redirects()'), config.indexOf('async headers()'));
  assert.ok(!redirects.includes(wellKnown), 'the well-known path must never be redirected');
});

test('the document is served as JSON with no file extension in the path', () => {
  // Served as anything but application/json — application/octet-stream is what
  // a static host picks for an extensionless file — iOS ignores it.
  const route = read('src/app/api/apple-app-site-association/route.ts');
  assert.match(route, /'Content-Type': 'application\/json'/);
});

test('the document has the shape iOS 13+ reads', () => {
  const doc = appleAppSiteAssociation();
  const detail = doc.applinks.details[0];
  assert.deepEqual(detail.appIDs, [APP_ID]);
  // `components`, not the legacy `paths` array.
  assert.ok(Array.isArray(detail.components));
  assert.ok(detail.components.every((c) => typeof c['/'] === 'string'));
});
