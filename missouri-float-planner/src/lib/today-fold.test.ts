import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collapsedAfterToggle,
  isUpdateOpen,
} from '../../../eddy-ios/src/lib/todayPreferences';

// The Today tab's global-update card shipped with an INVERTED fold. It computed
// `open = collapsed === false` and then stored `!open` as the next collapsed
// value — which is the state it was already in. The chevron flipped its own
// glyph and did nothing else, in either direction, on every device.
//
// It read as a dead control rather than as a bug, which is why it survived: a
// card stuck open looks like a card with no fold, and a card stuck shut looks
// like a server that stopped sending the report. Both were reported as other
// things.
//
// The Expo app has no test runner, so the state machine lives in
// todayPreferences.ts as two pure functions and is held to its contract here.

test('the fold opens and shuts, and a toggle round trip returns to the start', () => {
  // The bug, stated as the property it violated: toggling twice is identity,
  // and toggling ONCE is not.
  let collapsed = false;
  assert.equal(isUpdateOpen(true, collapsed), true, 'a stored `false` is open');

  collapsed = collapsedAfterToggle(isUpdateOpen(true, collapsed));
  assert.equal(isUpdateOpen(true, collapsed), false, 'one tap shuts it');

  collapsed = collapsedAfterToggle(isUpdateOpen(true, collapsed));
  assert.equal(isUpdateOpen(true, collapsed), true, 'a second tap opens it again');
});

test('a tap always changes the state', () => {
  // THE test. A no-op toggle passes "twice is identity" trivially, which is
  // exactly what the shipped version did — so the round trip above cannot catch
  // it alone. This says a single tap must land somewhere else than it started.
  for (const open of [true, false]) {
    const after = isUpdateOpen(true, collapsedAfterToggle(open));
    assert.equal(after, !open, `tapping while ${open ? 'open' : 'shut'} must flip it`);
  }
});

test('the card is shut while the stored answer is still being read', () => {
  // `undefined` is the third state, and it must not open the card and then
  // close it under the reader's thumb a frame later.
  assert.equal(isUpdateOpen(true, undefined), false);
});

test('nothing to show is shut, whatever the preference says', () => {
  // A day the server withheld the statewide prose. There is no chevron in this
  // state, so a stored "open" must not put the card into one.
  assert.equal(isUpdateOpen(false, false), false);
  assert.equal(isUpdateOpen(false, true), false);
  assert.equal(isUpdateOpen(false, undefined), false);
});
