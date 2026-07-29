// src/lib/map/public-land-parity.test.ts
// Asserts the web and the app paint PAD-US boundaries identically.
//
// Two copies exist for the reason stated in ./public-land-style.ts: Vercel
// installs only missouri-float-planner/, so shippable web code cannot import
// @eddy/types. Tests may reach across — they run under tsconfig.test.json — so
// this is the guard on the duplication.
//
// The stake is higher than it looks for a colour table. Both maps draw the same
// federal dataset, and the whole design argument for the layer is that WEIGHT
// carries confidence: solid means the agency says the public may be here, faint
// means the agency does not know. If the phone and the website disagree about
// which shade is which, a reader who learns the vocabulary on one is actively
// misled by the other — about land access, which is the one thing this layer
// exists to be careful about.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_LAND_ACCESS_LABELS as SHARED_LABELS,
  PUBLIC_LAND_ACCESS_STYLE as SHARED_STYLE,
  PUBLIC_LAND_OWNERSHIP_NOTE as SHARED_NOTE,
  publicLandAccessLabel as sharedLabel,
  publicLandAccessStyle as sharedStyle,
} from '../../../../packages/eddy-types/index';
import {
  PUBLIC_LAND_ACCESS_LABELS,
  PUBLIC_LAND_ACCESS_ORDER,
  PUBLIC_LAND_ACCESS_STYLE,
  PUBLIC_LAND_OWNERSHIP_NOTE,
  publicLandAccessLabel,
  publicLandAccessStyle,
} from './public-land-style';

test('the access style table is identical on both sides', () => {
  assert.deepEqual(PUBLIC_LAND_ACCESS_STYLE, SHARED_STYLE);
});

test('the access labels are identical on both sides', () => {
  assert.deepEqual(PUBLIC_LAND_ACCESS_LABELS, SHARED_LABELS);
});

test('the ownership caveat is one sentence, written once', () => {
  // The single most important string in this feature. A layer that draws
  // federal ownership without saying it is not permission is a layer that
  // tells people they may camp somewhere they may not.
  assert.equal(PUBLIC_LAND_OWNERSHIP_NOTE, SHARED_NOTE);
  assert.match(PUBLIC_LAND_OWNERSHIP_NOTE, /Ownership, not permission/);
});

test('unknown and unrecognised codes fall back to UK on both sides', () => {
  // PAD-US is a federal dataset that gains codes without asking us. Both
  // clients must render a fifth class as "we do not know", which is true, and
  // neither may render it as open, which would not be.
  for (const access of [null, undefined, '', 'UK', 'uk', 'ZZ', 'Open']) {
    assert.deepEqual(publicLandAccessStyle(access), sharedStyle(access), `style for ${access}`);
    assert.equal(publicLandAccessLabel(access), sharedLabel(access), `label for ${access}`);
  }
  assert.deepEqual(publicLandAccessStyle('ZZ'), PUBLIC_LAND_ACCESS_STYLE.UK);
});

test('lowercase and mixed-case codes resolve like their canonical form', () => {
  // The wire carries whatever PAD-US published. Nothing normalises it upstream,
  // so a lowercase 'oa' must not silently become "access unknown".
  for (const code of PUBLIC_LAND_ACCESS_ORDER) {
    assert.deepEqual(publicLandAccessStyle(code.toLowerCase()), PUBLIC_LAND_ACCESS_STYLE[code]);
    assert.equal(publicLandAccessLabel(code.toLowerCase()), PUBLIC_LAND_ACCESS_LABELS[code]);
  }
});

test('only open access is drawn solid', () => {
  // The load-bearing half of the visual encoding: a solid boundary is the one
  // claim this layer makes, and it may only be made where the agency made it.
  assert.equal(PUBLIC_LAND_ACCESS_STYLE.OA.solid, true);
  for (const code of ['RA', 'XA', 'UK'] as const) {
    assert.equal(PUBLIC_LAND_ACCESS_STYLE[code].solid, false, `${code} must not be drawn solid`);
  }
});

test('no access colour is borrowed from the condition ramp', () => {
  // The other hard rule. Red/amber/green on this map mean "do not float", "use
  // caution" and "go" — about the water, from a reading Eddy stands behind. A
  // federal ownership classification may not borrow any of them.
  const CONDITION_HEX = new Set(
    ['#ef4444', '#10b981', '#84cc16', '#f97316', '#eab308', '#78716c', '#9ca3af'].map((h) => h.toLowerCase()),
  );
  const CONDITION_RGB = [
    [239, 68, 68],
    [16, 185, 129],
    [132, 204, 22],
    [249, 115, 22],
    [234, 179, 8],
    [120, 113, 108],
    [156, 163, 175],
  ];
  for (const code of PUBLIC_LAND_ACCESS_ORDER) {
    const { fill, line } = PUBLIC_LAND_ACCESS_STYLE[code];
    assert.ok(!CONDITION_HEX.has(line.toLowerCase()), `${code} line ${line} is a condition colour`);
    const rgb = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    assert.ok(rgb, `${code} fill must be rgba so its alpha is explicit: ${fill}`);
    const triple = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    for (const c of CONDITION_RGB) {
      assert.ok(
        !(c[0] === triple[0] && c[1] === triple[1] && c[2] === triple[2]),
        `${code} fill ${fill} is a condition colour`,
      );
    }
  }
});
