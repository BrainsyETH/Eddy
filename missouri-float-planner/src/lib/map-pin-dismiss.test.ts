import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── ONE TAP IN, ONE TAP OUT ────────────────────────────────────────────────
//
// `onSelectPin` selects the river a pin sits on when nobody had chosen it, and
// it does that deliberately: everything downstream of a put-in is river-scoped.
// The cost used to land on the way out. × cleared the pin, the selection the
// tap had silently made stayed behind, and the river sheet rose into the gap —
// so tapping a campground from the statewide map cost TWO dismissals, the
// second of them for a sheet that only existed because of the first tap.
//
// The rule now is that × goes where Back goes:
//
//   • a river sheet was on screen before this pin → pop one level onto it,
//   • nothing was → the river underneath is this tap's own doing, so it goes
//     down with the pin.
//
// `revealsRiverSheet` is the one fact that decides both, which is what keeps
// the two controls agreeing.
//
// This is guarded because the regression is a one-line flattening — wiring
// `onClose` back to a bare `setSelectedPin(null)` looks like a simplification
// and reads correctly in every state except the one the reader is usually in.
// Nothing type-checks it and nothing crashes.
//
// Source-parsed: the map screen is a React Native route that imports Mapbox,
// expo-router and the themed palette, none of which this suite can load. Same
// technique as the map-sheet guards next door.

const SCREEN = readFileSync(
  join(process.cwd(), '..', 'eddy-ios', 'app', '(tabs)', 'index.tsx'),
  'utf8',
);

/** The JSX props of one element, from its tag to the tag that follows it. */
function element(tag: string, until: string): string {
  const at = SCREEN.indexOf(`<${tag}`);
  assert.notEqual(at, -1, `${tag} must be rendered`);
  const end = SCREEN.indexOf(until, at);
  assert.notEqual(end, -1, `${tag} must be followed by ${until}`);
  return SCREEN.slice(at, end);
}

test('the pin sheet is dismissed through the rule, not a bare pin clear', () => {
  // The map area's closing tag; PinSheet is the last thing inside it.
  const pinSheet = element('PinSheet', '</View>');
  const onClose = pinSheet.match(/onClose=\{([^}]*)\}/);
  assert.ok(onClose, 'the pin sheet must have a close handler');
  assert.equal(
    onClose[1],
    'dismissPin',
    'x must go through dismissPin — a bare setSelectedPin(null) leaves the river the tap selected',
  );
});

test('dismissPin pops one level only when there is one', () => {
  const at = SCREEN.indexOf('const dismissPin');
  assert.notEqual(at, -1, 'the map screen must define dismissPin');
  const body = SCREEN.slice(at, SCREEN.indexOf('}, [', at));

  assert.match(
    body,
    /revealsRiverSheet/,
    'the branch must turn on whether a river sheet was on screen BEFORE this pin',
  );
  assert.match(
    body,
    /setSelectedPin\(null\)/,
    'with something underneath, dismissing pops one level and leaves the river alone',
  );
  assert.match(
    body,
    /clearRiver\(\)/,
    'with nothing underneath, the river the tap selected goes down with the pin',
  );
});

test('back and x agree about what is underneath', () => {
  // They must read the same fact, or the sheet offers "‹ Jacks Fork" and then
  // x lands somewhere else — which is the two-outcomes-for-one-glyph defect
  // this sheet's navigation was reworked to remove.
  const pinSheet = element('PinSheet', '</View>');
  // `backLabel` is the prop declared immediately after it, which bounds the
  // slice without this having to balance braces.
  const onBack = pinSheet.slice(pinSheet.indexOf('onBack='), pinSheet.indexOf('backLabel='));
  assert.ok(onBack.length > 0, 'the pin sheet must decide whether to offer Back');
  assert.match(
    onBack,
    /revealsRiverSheet/,
    'Back is offered from the same fact dismissPin branches on',
  );
});

test('the river sheet keeps its own close', () => {
  // Dismissing a pin must never be the only way to put a river down, and
  // clearing a river the READER chose stays that sheet's own control.
  const riverSheet = element('RiverSheetPanel', '<PinSheet');
  assert.match(riverSheet, /onClose=\{clearRiver\}/, 'the river sheet closes the river');
});
