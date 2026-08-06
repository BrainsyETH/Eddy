import assert from 'node:assert/strict';
import test from 'node:test';
import { overviewLead, waitingCopy } from '../../../eddy-ios/src/lib/accessCopy';

// Covers eddy-ios/src/lib/accessCopy.ts's overviewLead, run from here because
// the Expo app has no runner of its own.
//
// ── WHAT THIS IS FOR ──────────────────────────────────────────────────────
// Overview is the tab a pin lands you on, and it is description + Water (only
// with a gauge) + Camping nearby (only with a campground service) + the river
// row. 81 of Eddy's 406 access points have no description, so a put-in with no
// gauge on its reach landed the reader on one link — which reads as broken
// rather than as sparse.
//
// The answer is promotion, not invented copy: 80 of those 81 already carry a
// fact in the same response. Exactly one access point in the database is bare.

test('a description means nothing is promoted', () => {
  // A fallback, never a supplement. Two paragraphs saying overlapping things is
  // how the Place tab became a junk drawer.
  assert.equal(
    overviewLead({
      description: 'A wide gravel bar below the bluff.',
      roadAccess: 'Gravel for the last two miles.',
    }),
    null,
  );
});

test('road access leads, because it is what a stranger needs first', () => {
  assert.equal(
    overviewLead({ description: null, roadAccess: 'Gravel for the last two miles.' }),
    'Gravel for the last two miles.',
  );
});

test('the order is road, parking, facilities, then notes', () => {
  const all = {
    description: null,
    roadAccess: 'road',
    parkingInfo: 'parking',
    facilities: 'facilities',
    localTips: 'tips',
  };
  assert.equal(overviewLead(all), 'road');
  assert.equal(overviewLead({ ...all, roadAccess: null }), 'parking');
  assert.equal(overviewLead({ ...all, roadAccess: null, parkingInfo: null }), 'facilities');
  assert.equal(
    overviewLead({ ...all, roadAccess: null, parkingInfo: null, facilities: null }),
    'tips',
  );
});

test('local tips arrive as HTML and must not reach the screen as tags', () => {
  // The one field of the four that is rich text — it is why Place already runs
  // it through stripHtml before rendering.
  assert.equal(
    overviewLead({
      description: null,
      localTips: '<p>Watch the <strong>strainer</strong> below the bend.</p>',
    }),
    'Watch the strainer below the bend.',
  );
});

test('a column holding only whitespace holds nothing', () => {
  // '' and '   ' both mean "not filled in", and promoting one would put a blank
  // paragraph where the reader was promised a sentence.
  assert.equal(
    overviewLead({ description: null, roadAccess: '   ', parkingInfo: 'Room for six.' }),
    'Room for six.',
  );
  assert.equal(overviewLead({ description: '   ', roadAccess: 'Gravel.' }), 'Gravel.');
});

test('a genuinely bare access point promotes nothing', () => {
  // One access point in the database is in this state, and the tab draws its
  // terminal line rather than a blank page. That branch is the caller's; this
  // function's job is to say honestly that it has nothing.
  assert.equal(overviewLead({ description: null }), null);
  assert.equal(overviewLead(null), null);
});

test('an empty local-tips document is not a lead', () => {
  // stripHtml returns null for markup that carries no text, so a `<p></p>` left
  // by a CMS must not count as a fact about the river.
  assert.equal(overviewLead({ description: null, localTips: '<p></p>' }), null);
});

/* ── A failed request is not an answer ───────────────────────────────────── */

test('a failed request never claims Eddy has nothing', () => {
  // The tab-level empty line was written without waitingCopy and so reported an
  // ERRORED request as confirmed absence — a claim about the data made from a
  // failure to load it. These are different facts and the reader can act on only
  // one of them.
  const failed = waitingCopy('failed', 'description');
  assert.ok(!failed.includes('no description'), failed);
  assert.match(failed, /unavailable right now/);
  assert.match(failed, /^Description/, 'the subject is capitalised to start a sentence');
});

test('a settled, genuinely empty request says so plainly', () => {
  // 'ready' means the request came back with nothing; 'idle' means no request
  // was ever made because the pin carries no detail route. Both are answers.
  for (const status of ['ready', 'idle'] as const) {
    assert.equal(waitingCopy(status, 'description'), 'Eddy has no description for this place.');
  }
});

test('a request still in flight promises nothing either way', () => {
  assert.equal(waitingCopy('loading', 'description'), 'Loading description…');
});

test('every status produces a different sentence', () => {
  // The whole point: four states, four things a reader can do about them. Any
  // two collapsing is how "failed" came to read as "absent".
  const said = new Set(
    (['idle', 'loading', 'ready', 'failed'] as const).map((s) => waitingCopy(s, 'details')),
  );
  // idle and ready are deliberately the same sentence — both mean "settled with
  // nothing" — so three distinct outcomes from four states is correct.
  assert.equal(said.size, 3);
});
