// src/lib/navigation/deep-links-parity.test.ts
// Asserts the web and app navigation deep links are the same links.
//
// There are deliberately two implementations. Vercel installs only
// missouri-float-planner/, so shippable web code cannot import @eddy/geo —
// src/lib/navigation/deepLinks.ts keeps its own copy, exactly as src/types/api.ts
// hand-mirrors @eddy/types for the same reason. Tests are the one place that may
// reach across, because they run under tsconfig.test.json rather than the build.
//
// So this file is the guard rail on that duplication. If someone corrects onX's
// scheme on one side and not the other, half the users get a dead button and
// nothing else in CI would say so.
//
// `scheme` is excluded from the comparison and is the only field that is: it
// exists solely so a native client can ask canOpenURL whether an app is
// installed, and the web app answers that question with a navigation timeout
// instead. `icon` is excluded for the mirror-image reason — an emoji is web
// presentation, and the web app does not even render it (AccessPointNav draws
// the real app logos).

import assert from 'node:assert/strict';
import test from 'node:test';
import { navLinksFor, navCoordinatesFor } from '../../../../packages/eddy-geo/index';
import { generateNavLinks, getNavCoordinates } from './deepLinks';

/** The fields both copies are required to agree on. */
function comparable(link: {
  app: string;
  label: string;
  subtitle: string;
  deepLink: string;
  webFallback: string;
  storeUrl: { ios: string; android: string };
}) {
  return {
    app: link.app,
    label: link.label,
    subtitle: link.subtitle,
    deepLink: link.deepLink,
    webFallback: link.webFallback,
    storeUrl: link.storeUrl,
  };
}

// Akers Ferry on the Current — a real access point, and one whose name needs
// encoding in the Apple and Google URLs.
const COORDS = { lat: 37.3776, lng: -91.5528, label: "Akers Ferry" };

test('web and app emit identical navigation URLs', () => {
  assert.deepEqual(
    generateNavLinks(COORDS).map(comparable),
    navLinksFor(COORDS).map(comparable)
  );
});

test('both offer the same four apps, in the same order', () => {
  assert.deepEqual(
    navLinksFor(COORDS).map((l) => l.app),
    ['onx', 'gaia', 'google', 'apple']
  );
});

test('a directions override replaces both Google URLs and nothing else', () => {
  const override = 'https://www.google.com/maps/dir/?api=1&destination=Akers+Ferry+MO';

  const web = generateNavLinks(COORDS, override).map(comparable);
  const app = navLinksFor(COORDS, override).map(comparable);
  assert.deepEqual(web, app);

  const google = app.find((l) => l.app === 'google');
  assert.equal(google?.deepLink, override);
  assert.equal(google?.webFallback, override);

  // The other three cannot consume someone else's route and must be untouched.
  for (const app_ of ['onx', 'gaia', 'apple'] as const) {
    const withOverride = app.find((l) => l.app === app_);
    const without = navLinksFor(COORDS).map(comparable).find((l) => l.app === app_);
    assert.deepEqual(withOverride, without);
  }
});

test('every scheme is the prefix of its own deep link', () => {
  // What canOpenURL is handed on iOS has to be the app the button opens, or the
  // probe answers about a different app than the one being drawn.
  for (const link of navLinksFor(COORDS)) {
    if (link.app === 'google') continue; // overridable to an https URL
    assert.ok(
      link.deepLink.startsWith(`${link.scheme}://`),
      `${link.app}: ${link.deepLink} does not start with ${link.scheme}://`
    );
  }
});

test('labels with spaces are encoded, not interpolated raw', () => {
  const apple = navLinksFor(COORDS).find((l) => l.app === 'apple');
  assert.ok(apple);
  assert.ok(apple.deepLink.includes('Akers%20Ferry'));
  assert.ok(!apple.deepLink.includes('Akers Ferry'));
});

test('driving coordinates win over the waterline, on both sides', () => {
  // A gravel bar's coordinate is in the river. Routing someone there hands them
  // a destination with no road to it.
  const point = {
    drivingLat: 37.4,
    drivingLng: -91.6,
    coordinates: { lat: 37.3776, lng: -91.5528 },
    name: 'Akers Ferry',
  };
  const expected = { lat: 37.4, lng: -91.6, label: 'Akers Ferry' };
  assert.deepEqual(navCoordinatesFor(point), expected);
  assert.deepEqual(getNavCoordinates(point), expected);
});

test('missing driving coordinates fall back to the access point, on both sides', () => {
  const point = {
    drivingLat: null,
    drivingLng: null,
    coordinates: { lat: 37.3776, lng: -91.5528 },
    name: 'Akers Ferry',
  };
  const expected = { lat: 37.3776, lng: -91.5528, label: 'Akers Ferry' };
  assert.deepEqual(navCoordinatesFor(point), expected);
  assert.deepEqual(getNavCoordinates(point), expected);
});
