import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_BOTTOM_PAD,
  DISMISS_FRACTION,
  FLICK_VELOCITY,
  GRABBER_BLOCK,
  MIN_DETENT_GAP,
  ORNAMENT_BAND,
  pageBudget,
  PEEK_MAX,
  resolveDetents,
  settleTarget,
  STRONG_FLICK_VELOCITY,
  applyRubberBand,
} from '../../../eddy-ios/src/components/map-sheet/sheetGeometry';

// Covers eddy-ios/src/components/map-sheet/sheetGeometry.ts. The Expo app has
// no runner of its own, and these are the rules that decide where a dragged
// sheet lands — the part of the map sheet most likely to be argued about and
// the only part that can be checked without a device.
//
// A tall phone's map area, roughly: 844pt screen less the tab bar and insets.
const TALL = 700;

test('a sheet whose content fits inside the glance offers one detent', () => {
  // The hazard callout is ~115pt. Three detents there would have meant two
  // heights showing blank card below the content.
  const d = resolveDetents(TALL, 115);
  assert.deepEqual(d.order, ['peek']);
  assert.equal(d.height.peek, 115);
});

test('peek is never taller than the content', () => {
  const d = resolveDetents(TALL, 90);
  assert.equal(d.height.peek, 90);
});

test('peek is capped however tall the phone', () => {
  // 0.32 of a 1400pt area would be 448 without the cap.
  const d = resolveDetents(1400, 2000);
  assert.equal(d.height.peek, PEEK_MAX);
});

test('tall content earns all three detents, ascending', () => {
  const d = resolveDetents(TALL, TALL);
  assert.deepEqual(d.order, ['peek', 'half', 'full']);
  assert.ok(d.height.peek < d.height.half);
  assert.ok(d.height.half < d.height.full);
});

test('a single-page callout keeps its glance however long its body is', () => {
  // A hazard's body is the portage instruction, the description and the
  // seasonal notes joined, so it is routinely long. Uncapped it measures as a
  // 500pt "peek", which is not a glance — the fraction takes over, and the rest
  // goes below the fold where the drag reaches it.
  const tallCallout = resolveDetents(TALL, 500, 500, true);
  assert.equal(tallCallout.height.peek, Math.round(TALL * 0.32));
  assert.ok(tallCallout.order.length > 1, 'a long callout must earn something to drag to');
  assert.equal(tallCallout.height[tallCallout.order[tallCallout.order.length - 1]], 500);
});

test('a short callout is unchanged by that rule, and still one detent', () => {
  // The hazard callout at ~115pt: shorter than the fraction, so the clamp has
  // nothing to do and this behaves exactly as it did before.
  const short = resolveDetents(TALL, 115, 115, true);
  assert.deepEqual(short.order, ['peek']);
  assert.equal(short.height.peek, 115);
});

test('an authored glance is measured as authored, not clamped', () => {
  // The access sheet's peek ends exactly where its primary action does, which
  // is the whole reason it is measured rather than taken from the fraction.
  // Clamping it would reopen the bug that comment describes: a sheet opening on
  // half a control strip.
  const authored = resolveDetents(TALL, 900, 260);
  assert.equal(authored.height.peek, 260);
  assert.ok(260 > Math.round(TALL * 0.32), 'the fixture must exceed the fraction to prove anything');
});

test('the tallest detent always leaves the Mapbox ornaments somewhere to sit', () => {
  // Not a layout preference. The logo and the attribution are a term of the
  // licence, the sheet covers the band they live in, and the map screen lifts
  // them onto the sheet's top edge — which only works if there is room up
  // there. FULL_FRACTION alone left 8% of the map, which is less than the
  // attribution's own tap frame on every phone Eddy runs on.
  for (const available of [420, 500, 600, TALL, 900, 1400]) {
    const d = resolveDetents(available, available * 2);
    const tallest = d.height[d.order[d.order.length - 1]];
    assert.ok(
      tallest + ORNAMENT_BAND <= available,
      `a ${available}pt map area settles at ${tallest}, leaving ${available - tallest} for a ${ORNAMENT_BAND}pt band`,
    );
  }
});

test('the ornament band binds before FULL_FRACTION does on a real phone', () => {
  // Both ceilings are real; which one wins depends on the phone. Stated so that
  // changing either fraction shows up here rather than as an ornament sliding
  // back under the sheet.
  assert.equal(resolveDetents(TALL, TALL * 2).height.full, TALL - ORNAMENT_BAND);
  // Past ~775pt of map area the 8% FULL_FRACTION leaves is the larger gap, and
  // it takes over. No phone is this tall; an iPad in a future split view is.
  assert.equal(resolveDetents(2000, 4000).height.full, Math.round(2000 * 0.92));
});

test('detents closer together than the floor collapse into one', () => {
  const d = resolveDetents(TALL, TALL);
  for (let i = 1; i < d.order.length; i += 1) {
    const gap = d.height[d.order[i]] - d.height[d.order[i - 1]];
    assert.ok(gap >= MIN_DETENT_GAP, `gap ${gap} below floor at ${d.order[i]}`);
  }
});

test('an unmeasured content height still yields a usable sheet', () => {
  // First frame, before onLayout. Must not be a zero-height sheet that jumps.
  const d = resolveDetents(TALL, 0);
  assert.ok(d.height.peek > 0);
  assert.deepEqual(d.order, ['peek']);
});

test('zero available height does not throw or go negative', () => {
  const d = resolveDetents(0, 0);
  assert.equal(d.height.peek, 0);
  assert.deepEqual(d.order, ['peek']);
});

test('a strong upward throw reaches the tallest detent from anywhere', () => {
  const d = resolveDetents(TALL, TALL);
  const from = d.height.peek;
  assert.equal(settleTarget(d, from, -STRONG_FLICK_VELOCITY - 1), 'full');
});

test('a strong downward throw collapses rather than skipping to dismissal', () => {
  // Maps' behaviour: a hard flick down from the top goes to the glance, not
  // straight out. Only a flick from the glance itself closes.
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.full, STRONG_FLICK_VELOCITY + 1), 'peek');
  assert.equal(settleTarget(d, d.height.peek, STRONG_FLICK_VELOCITY + 1), null);
});

test('a soft flick steps exactly one detent, not all the way', () => {
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.peek, -FLICK_VELOCITY - 1), 'half');
  assert.equal(settleTarget(d, d.height.full, FLICK_VELOCITY + 1), 'half');
});

test('a soft upward flick from just above a detent still reaches the next', () => {
  // The reason stepFrom works from where the sheet IS rather than from the
  // nearest detent: nearest-then-step would have skipped 'half' here.
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.peek + 2, -FLICK_VELOCITY - 1), 'half');
});

test('a slow release lands on the nearest detent', () => {
  const d = resolveDetents(TALL, TALL);
  const between = (d.height.peek + d.height.half) / 2;
  assert.equal(settleTarget(d, between - 20, 0), 'peek');
  assert.equal(settleTarget(d, between + 20, 0), 'half');
});

test('released well below the glance, the sheet closes', () => {
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.peek * DISMISS_FRACTION - 1, 0), null);
});

test('released just above the dismissal line, the sheet survives', () => {
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.peek * DISMISS_FRACTION + 1, 0), 'peek');
});

test('a one-detent sheet can still be thrown shut', () => {
  // The short-callout case: no detent to collapse to, so a downward flick has
  // to mean dismissal or the sheet would be impossible to put down by drag.
  const d = resolveDetents(TALL, 115);
  assert.equal(settleTarget(d, d.height.peek, STRONG_FLICK_VELOCITY + 1), null);
  assert.equal(settleTarget(d, d.height.peek, FLICK_VELOCITY + 1), null);
});

test('dragged above the tallest detent it always falls back', () => {
  const d = resolveDetents(TALL, TALL);
  assert.equal(settleTarget(d, d.height.full + 200, 0), 'full');
});

test('rubber band resists only above the tallest detent', () => {
  assert.equal(applyRubberBand(300, 500), 300);
  assert.equal(applyRubberBand(500, 500), 500);
  // Resisted, and always short of the raw drag.
  const stretched = applyRubberBand(600, 500);
  assert.ok(stretched > 500 && stretched < 600);
});

test('downward travel is never rubber banded', () => {
  // Dismissal has to feel like a direction you can throw the sheet in.
  assert.equal(applyRubberBand(10, 500), 10);
  assert.equal(applyRubberBand(0, 500), 0);
});

test('a page never claims more room than the tallest detent can show', () => {
  // The bug this exists for: a page capped at the whole available height
  // believed its viewport ran to the bottom of the screen, so it stopped
  // scrolling with the last inch of a long tab still below the fold.
  const inset = 34;
  const budget = pageBudget(TALL, inset);
  const tallest = resolveDetents(TALL, TALL * 2).height.full;
  assert.ok(budget > 0);
  assert.ok(
    budget + GRABBER_BLOCK + CONTENT_BOTTOM_PAD + inset <= tallest,
    `budget ${budget} plus chrome exceeds the tallest detent ${tallest}`,
  );
});

test('a page filling its budget makes a sheet that reaches, but does not exceed, full', () => {
  // The budget and the detents have to agree, or the sheet either clips the
  // page or grows past what it can show. Chrome here stands in for a header
  // and tab bar; the page takes what is left.
  const inset = 34;
  const chrome = 180;
  const page = pageBudget(TALL, inset) - chrome;
  const content = chrome + page + CONTENT_BOTTOM_PAD + inset;
  const d = resolveDetents(TALL, content + GRABBER_BLOCK);
  assert.equal(d.height.full, content + GRABBER_BLOCK);
  assert.ok(d.height.full <= TALL);
});

test('the page budget never goes negative on a small or unmeasured sheet', () => {
  assert.equal(pageBudget(0, 34), 0);
  assert.equal(pageBudget(-100, 34), 0);
  // A phone whose insets exceed what the tallest detent offers.
  assert.equal(pageBudget(40, 200), 0);
});
