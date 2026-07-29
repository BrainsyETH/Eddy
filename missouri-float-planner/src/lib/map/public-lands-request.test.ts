// src/lib/map/public-lands-request.test.ts
// The request handling for /api/public-lands.
//
// Written after curling the deployed route found two defects that were
// invisible in review, and both are pinned below by name. The lesson worth
// keeping is not "add tests" — it is that both bugs were shaped like SUCCESS:
// one returned an empty layer at HTTP 200 for a malformed request, the other
// told the client to zoom in on a viewport that was already showing everything.
// Neither would ever have produced a stack trace, a 500 or a log line.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_ZOOM,
  normalizeAccess,
  parseBbox,
  parseLimit,
  parseZoom,
  toleranceForZoom,
  wasCapped,
} from './public-lands-request';

// ── parseZoom ──────────────────────────────────────────────────────────────

test('a missing zoom is an error, not zoom 0', () => {
  // THE BUG. `searchParams.get` returns null for an absent parameter and
  // `Number(null)` is 0 — finite, so the old `Number.isFinite` guard could not
  // fire for the one case it was written for. Zoom 0 then fell under MIN_ZOOM
  // and the route answered "no public land here" at HTTP 200. Verified against
  // production before the fix: dropping `&zoom=11` turned 73 features into 0
  // with no error anywhere.
  const { zoom, error } = parseZoom(null);
  assert.equal(zoom, null);
  assert.match(error ?? '', /zoom is required/);
});

test('an empty or blank zoom is the same mistake, spelled differently', () => {
  // `?zoom=` and `?zoom=%20`. Number('') and Number('  ') are both 0 too, so
  // these would have taken the identical silent path.
  for (const raw of ['', '   ']) {
    assert.equal(parseZoom(raw).zoom, null, `parseZoom(${JSON.stringify(raw)})`);
  }
});

test('a non-numeric zoom is an error rather than a silent empty layer', () => {
  for (const raw of ['eleven', 'NaN', '1.2.3']) {
    const { zoom, error } = parseZoom(raw);
    assert.equal(zoom, null, `parseZoom(${raw})`);
    assert.ok(error);
  }
});

test('a real zoom parses, including a fractional one', () => {
  // The clients send a live camera zoom, which is fractional between steps.
  assert.deepEqual(parseZoom('11'), { zoom: 11, error: null });
  assert.deepEqual(parseZoom('11.7'), { zoom: 11.7, error: null });
});

test('zoom 0 is still accepted when it is genuinely asked for', () => {
  // The floor is enforced by the route, not by the parser. A caller that really
  // does send zoom 0 gets an empty collection at 200 — the same answer as open
  // ocean — which is correct, and is exactly what must NOT happen by accident.
  assert.deepEqual(parseZoom('0'), { zoom: 0, error: null });
  assert.ok(0 < MIN_ZOOM);
});

// ── wasCapped ──────────────────────────────────────────────────────────────

test('capped is false when everything in the viewport was returned', () => {
  // THE OTHER BUG, at the exact numbers observed in production: a Current River
  // viewport matched 74 parcels with 400 of room, and one of them clipped to an
  // empty geometry at the box edge — so the RPC returned 73. Comparing `total`
  // to the RETURNED COUNT read that as "the cap bit" and told the client to
  // zoom in on a view that was showing every parcel there is.
  assert.equal(wasCapped(74, DEFAULT_LIMIT), false);
  assert.equal(wasCapped(73, DEFAULT_LIMIT), false);
  assert.equal(wasCapped(0, DEFAULT_LIMIT), false);
});

test('capped is true only when there was genuinely more than the cap', () => {
  // The statewide case, which is the one the disclosure exists for.
  assert.equal(wasCapped(1031, DEFAULT_LIMIT), true);
  assert.equal(wasCapped(401, 400), true);
  // Exactly the cap is NOT capped: nothing was dropped.
  assert.equal(wasCapped(400, 400), false);
});

// ── parseLimit ─────────────────────────────────────────────────────────────

test('a junk limit falls back to the default rather than erroring', () => {
  // A bad `limit` is a caller's typo, not a reason to blank a map layer.
  for (const raw of [null, '', 'lots', '0', '-5']) {
    assert.equal(parseLimit(raw), DEFAULT_LIMIT, `parseLimit(${JSON.stringify(raw)})`);
  }
});

test('limit is clamped so no caller can pull the whole table', () => {
  assert.equal(parseLimit('50'), 50);
  assert.equal(parseLimit('99999'), MAX_LIMIT);
});

// ── toleranceForZoom ───────────────────────────────────────────────────────

test('tolerance is one screen pixel and shrinks as you zoom in', () => {
  // 360° over 256·2^z pixels. Pinned at two zooms so a "simplification"
  // refactor cannot quietly change how much geometry every client receives.
  assert.equal(toleranceForZoom(11), 360 / (256 * 2048));
  assert.ok(toleranceForZoom(14) < toleranceForZoom(11));
  assert.ok(toleranceForZoom(7) > toleranceForZoom(11));
});

test('tolerance at the zoom floor stays inside what the RPC will accept', () => {
  // The RPC clamps to [0.00005, 0.05]. A tolerance above that ceiling would be
  // silently clamped rather than honoured, which is worth knowing about at the
  // one zoom where the payload actually hurts.
  assert.ok(toleranceForZoom(MIN_ZOOM) <= 0.05);
});

// ── normalizeAccess ────────────────────────────────────────────────────────

test('access is upper-cased and never null on the wire', () => {
  // Both map renderers key a `match` expression straight off this field, so a
  // null or a lowercase code would fall to the default arm and paint open
  // ground as unknown.
  assert.equal(normalizeAccess(null), 'UK');
  assert.equal(normalizeAccess(''), 'UK');
  assert.equal(normalizeAccess('  '), 'UK');
  assert.equal(normalizeAccess('oa'), 'OA');
  assert.equal(normalizeAccess(' RA '), 'RA');
});

test('an access code PAD-US adds later survives verbatim', () => {
  // Passed through rather than rewritten to 'UK': the clients fall back to the
  // unknown treatment either way, and rewriting destroys the only evidence that
  // a new class exists.
  assert.equal(normalizeAccess('ZZ'), 'ZZ');
});

// ── parseBbox ──────────────────────────────────────────────────────────────

test('a valid bbox parses', () => {
  assert.deepEqual(parseBbox('-91.5,37.0,-91.2,37.2'), {
    bbox: [-91.5, 37, -91.2, 37.2],
    error: null,
  });
});

test('a malformed bbox is rejected rather than coerced', () => {
  for (const raw of [null, '', 'nope', '1,2,3', '1,2,3,4,5', 'a,b,c,d']) {
    assert.equal(parseBbox(raw).bbox, null, `parseBbox(${JSON.stringify(raw)})`);
  }
});

test('an inverted or out-of-range bbox is rejected', () => {
  assert.equal(parseBbox('-91,38,-91.5,37').bbox, null, 'south > north');
  assert.equal(parseBbox('-91.5,-95,-91,37').bbox, null, 'latitude out of range');
  assert.equal(parseBbox('-181,37,-91,38').bbox, null, 'longitude out of range');
});

test('an antimeridian-crossing bbox is refused, not silently emptied', () => {
  // west > east means the box wraps. Returning nothing would look like "no
  // public land in the Aleutians", which is a different claim from "ask me
  // twice".
  const { bbox, error } = parseBbox('179,51,-179,52');
  assert.equal(bbox, null);
  assert.match(error ?? '', /antimeridian/);
});
