# Map sheet — geometry findings, 2026-08-18

Raised from two device screenshots during 1.1 release prep: *"Peak is aligned
weird on some and there's a blank bar at the bottom of the slide up sheet taking
space."* Akers Ferry (Camping tab, sheet at `full`) and Horse Camp Access (sheet
at `peek`).

Three of the four findings below are **fixed**. One is documented and left
open on purpose, because it is a design decision rather than a defect. A fifth
observation could not be reproduced from the code and needs a repro.

---

## Fixed

### 1. The bottom pad was outside the scroller, so it was a permanent blank strip

`MapSheet` padded its content **column** — the parent of the pager:

```jsx
<View onLayout={onContentLayout} style={{ paddingBottom: insets.bottom + CONTENT_BOTTOM_PAD }}>
  <View onLayout={onPeekLayout}>{peek}</View>
  {children}          {/* chrome + SheetPager */}
</View>
```

Padding below a scroller is not air under the last row of a page. It is an
empty band across the foot of the card at **every detent and every scroll
offset**, which nothing can ever scroll into — which is exactly what the
screenshot shows, under a page whose own text is cut off mid-sentence above it.
`CONTENT_BOTTOM_PAD`'s own comment described the intent correctly ("air under
the last row of a page"); the placement did not implement it.

**Fixed:** the pad moved into each page's `contentContainerStyle` in
`SheetPager`, so it scrolls with the content and is reached at the end of a
page. The single-page callout keeps it on the column, since it has no scroller
to hold it. `pageBudget` no longer subtracts it — it is inside what scrolls
through the viewport, not taken off it.

### 2. The safe-area inset was added to a sheet that never reaches it

The same expression added `insets.bottom`, while the comment beside it argued
the tab navigator had already consumed the inset *"so in practice this is
`CONTENT_BOTTOM_PAD` alone"*. Both could not be true. `useSafeAreaInsets()`
reports the **window's** inset and a tab bar occupying that band does not zero
it, so on a home-indicator phone this was 34pt of dead band — and `pageBudget`
subtracted the same 34pt again, shortening every page's viewport by it.

`available` is measured from the map's overlay stack, which already excludes the
tab bar and both insets (`MapSheet`'s own note at the measurement). The sheet
therefore cannot reach the home indicator and owes it no clearance.

**Fixed:** the term is gone from both places, and `pageBudget` no longer takes a
`bottomInset` argument. Removing it is correct if the inset was ever non-zero
here and a no-op if the comment was right, so it did not need a device to
settle.

### 3. Every page's scroller was stretched to the tallest page beside it

`SheetPager`'s track is `flexDirection: 'row'` with no `alignItems`, so it
defaulted to `stretch` on the cross axis — vertical. A short tab's
`Animated.ScrollView` was stretched to the height of the tallest tab mounted
next to it, giving it a viewport far taller than its content and making it
report itself scrollable with nothing to scroll.

**Fixed:** `alignItems: 'flex-start'`, so each scroller is exactly its own
content, capped by `maxHeight`.

**Not fixed, and deliberately:** the track is still as tall as the tallest
*mounted* page, because a horizontal pager lays its pages side by side for a
swipe to reveal anything. Sizing the card to whichever page is in front needs
the active page measured and the track's height animated with it. That is a
larger change and has not been made — so a short tab beside a long one can still
leave space below it, now inert rather than inside a misleading scroller.

---

## Corrected during the work — not a defect

`pageBudget` discounts `GRABBER_BLOCK` from the peek measurement. This was
briefly believed to be wrong, on the reading that `onPeekLayout` wraps a view
which is a sibling *below* the grabber row and therefore excludes it.

**It is correct.** `MapSheet.onPeekLayout` adds the block explicitly:

```js
setPeekHeight(Math.round(event.nativeEvent.layout.height) + GRABBER_BLOCK);
```

so the measurement does include it and subtracting it back out is right. The
arithmetic is unchanged. `map-sheet-geometry.test.ts` states the premise and now
names where the block is added, so the next reader does not have to re-derive it
from the JSX alone.

---

## Open — a design decision, not a bug

### 4. The peek slot renders two different shapes

The reported "peak aligned weird on some". `readingRow` centers its children
correctly; the inconsistency is that one slot has two containers:

| Place | Peek shape | Where the reading sits |
| --- | --- | --- |
| Akers Ferry (campground) | Bordered availability card, tent icon, night-bar fortnight | `87 cfs / Flowing` right-aligned in the card's corner |
| Horse Camp Access (no availability) | Unboxed inline row | `124 cfs · Too Low · at Big Piney River…` flush left |

Same fact, two containers, two alignments — so the sheet's identity shifts
between places. Both are defensible alone; together they read as inconsistent.

Three ways out, none obviously right without seeing them side by side on a
device:

1. **Always the boxed card.** Consistent shape; more visual weight on places
   whose only fact is a gauge reading.
2. **Always the inline row.** Lighter and consistent; loses the night-bar chart
   from the glance, which is the campground peek's most useful element.
3. **Keep both, and align the reading the same way in each** — the smallest
   change, and it addresses the alignment complaint without losing the chart.

Left for a product call. Option 3 is the cheapest if the goal is only to stop
the reading moving between places.

---

## Needs a repro

### 5. The "Tonight" heading clipped at the top of the Camping tab

In the Akers Ferry shot the heading is cut roughly in half by the top edge of
its page. `styles.page` carries no vertical padding, so at scroll offset 0 that
heading should sit flush and fully visible — meaning the page was scrolled by
~10pt.

If it opened that way rather than being scrolled by hand, the suspect is
`MapSheet`'s drag hand-off: `sheetTakesIt` in the pan's `onUpdate` gives the
drag to the content scroller once the sheet is open all the way, and a drag that
carries the sheet to `full` may let the scroller absorb the remainder. The
re-anchor there covers the sheet lurching but not the scroller taking a few
points.

Not changed, because the fix differs entirely depending on which it is.

---

## Verification

`make check-mobile`, `make bundle-mobile` and the web suite all pass;
`map-sheet-geometry.test.ts` covers the new budget arithmetic, including a
regression test that the page pad is not charged to the viewport as well.

None of this was verified visually — there is no simulator in the environment it
was written in. The sheet wants a look on device before the build is cut:
a long tab (Camping on a large state park) scrolled to its end, a short tab
beside it, and the peek detent on both a campground and a plain access point.
