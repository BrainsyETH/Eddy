import assert from 'node:assert/strict';
import test from 'node:test';
import { overviewLead } from '../../../eddy-ios/src/lib/accessCopy';

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
