# Maps sheet UX and brand audit

Reviewed against `origin/main` at `e1faa534` on 2026-08-05. This is a static
audit of the iOS Maps sheet implementation and the existing native/App Store
captures.

**Revised 2026-08-05 after verifying every finding against the code.** Two
findings were wrong as written and are corrected below with the reason; two more
were missing. Each finding now carries what actually shipped. Where a
recommendation was not followed, the divergence is stated rather than quietly
dropped — a checked-in audit is read as guidance, so a remedy that would have
broken something has to say so.

## Outcome

The interaction model is strong. The sheet preserves map context, moves on the
compositor, respects reduced motion, keeps the selected tab stable while data
arrives, and uses the product's semantic condition colors correctly.

The remaining inconsistency was mostly identity, not mechanics: the map draws
places in Eddy's own art — `build-map-icons.py` derives every place pin from the
`assets/eddy` catalog — and then the selected-place sheet fell back to a 10 pt
colored dot, generic text chips and a 14 pt title. The sheet read as a well-made
system panel rather than as unmistakably Eddy.

## Priority findings

### P0 — Scope the color roles per platform ~~Resolve the conflicting source of truth~~

**Corrected.** The original finding said `.stitch/DESIGN.md` "still defines"
coral as the primary CTA and asked for the document to be rewritten to the
native split. That remedy was wrong: the website genuinely fills `.btn-primary`
with `var(--color-accent-500)` (`globals.css`), and DESIGN.md states its own
scope as "Platform: Web, Desktop-first". The document is not stale — it
accurately describes a shipped system. Rewriting its palette table to "teal =
actions" would have made it lie about every primary button on the site and
silently condemned them all.

The actual defect was one line up in `palette.ts`, which opened by calling
DESIGN.md "the design system of record, not this file" and then diverged from it
115 lines later. A divergence recorded on only one side of a border is
indistinguishable from drift, which is why both colors could be defended by
pointing at a repository source.

Shipped:

- [ADR 0007](decisions/0007-cta-fill-is-teal-on-native-coral-on-web.md) records
  the split and what reopening it would cost on each platform.
- DESIGN.md's Accent section carries a platform-scoped callout, and its
  `accent-500` row now names which platform each role belongs to.
- `palette.ts` states the exception in its header instead of claiming a
  subordination it does not practice, and `accentFill` notes that the website
  deliberately did not follow.
- `PinCallout`'s promoted-action comment no longer says "coral stays reserved for
  the float CTA" — that fill has been teal since `accentFill` changed, and the
  `tone: 'accent'` name is about rank, not hue.

The role split itself is unchanged from the original recommendation: teal for
actions, links, selected navigation and trust surfaces; coral for Eddy identity,
illustration and non-action emphasis; condition colors for river verdicts only.

### P1 — Give the selected place a branded identity — shipped

When a place had no photo, the header rendered a 10 pt colored dot while the pin
it came from was drawn in Eddy's art.

Shipped as `PlaceHead`: a 44 pt frame holding either the photo or the catalog
mark at 32 pt, with the layer or condition color kept as a 10 pt badge on the
corner. The split is the map's own — RiverMap already keeps a data-colored badge
under each pin because "the art says WHAT it is, the badge says condition or
severity" — so the sheet now shows the same drawing the finger landed on, at the
sharper 300 px source rather than the 66 px map variant.

Role resolution is `placeSymbol.ts`, and the precedence had to be written down
because a tapped place has two vocabularies that disagree: the layer says which
icon was on screen, the access point's `types` say what the place is. **The layer
wins**, for the reason `initialTabKey` lets it pick the opening tab — the
campgrounds and access layers present the same point under different icons, and
the one tapped is the one being looked for. Types decide only under the generic
`access` layer.

### P1 — Strengthen the glance hierarchy — shipped

The place name was `t.sm`/14 pt semibold, the same scale as the chips below it
and the tab labels beside it.

Now `t.base`/16 pt `fonts.heading`, two lines maximum, subtitle `t.sm` muted, the
one decision fact immediately below. **`t.lg` was rejected**, though the original
finding offered it: it carries a 29 pt line height, so two lines would spend
58 pt of a peek that is already negotiating with the map for the screen.

### P1 — Consolidate access-type badges — shipped

Access types were drawn as plain pills in the sheet's chrome and again at the top
of the Overview tab, nine points apart and visible at the same time. The
repetition was worse than first described: "Fee required" appeared in both, and
Overview added a "Private" pill duplicating the notice directly beneath it. The
pill itself was implemented three times, not twice — `PinSheet.tsx`,
`sections.tsx` and `PinCallout.tsx` — so only one of the three copies was ever on
screen and the other two were free to drift.

Shipped as one `AccessTypeBadges` in `sections.tsx`, used by the tabbed sheet's
chrome and by the callout, with Overview's copy removed. Types carry the
catalog's mark where one exists — boat ramp and campground, the two that change
the plan — and show the label alone where it does not, rather than borrowing a
drawing that means something else. Fee stays text, because a fee is a caveat
about a place already named and not a category of place. Private is not a badge
at all: both surfaces already carry the notice that explains it.

Map pins are unchanged, per the original finding: six type icons on one pin is a
legend test, and multi-role points would make it unreadable.

### P1 — Guarantee real 44 pt utility targets — shipped, and it was a bug

The original finding called the 19 pt glyph plus `hitSlop={12}` "close to the
44 pt target and usually works". It did not work. The row's gap was 10 pt and
each control carried 12 pt of slop, so the two slop regions **overlapped** across
the whole gap and reached about 2 pt into each glyph. iOS hit-tests later
siblings first and close is the later sibling, so close won the contested band: a
tap just right of the star closed the sheet instead of starring the place. A
sizing shortfall is a near miss; this was the wrong action.

Both are laid-out 44×44 boxes now, abutting rather than overlapping, with pressed
opacity and the original accessibility labels. The last one is pulled 10 pt into
the container's padding so the glyph still sits on the optical margin while its
target reaches the sheet edge.

### P1 — The catalog's aspect ratios vary, and the badge recommendation depended on it

**Missing from the original.** `EddySymbol` bounds a square box and contains the
art, but the build script trims each drawing to its own ink: boat ramp 300×180,
campground 300×240, dam 300×300, POI pin 219×300. So `size` meets the longest
side, and at 36 pt a wide mark paints 36×22 where a square one paints 36×36. Next
to a label that is invisible — both are 36 wide. In a slot large enough to look
at, a badge that changes size per place is exactly what "32–36 pt Eddy utility
symbol" would have produced.

The well in `PlaceHead` is the fix: the frame, the badge and the corner radius
hold still, and only the drawing inside breathes. **The art itself is not
normalized** — letterboxing every source to a common square in
`build-eddy-icons.py` would regenerate the whole catalog for a difference only
this slot can see, and a per-name size at the call site would be a caller faking
a catalog property. Recorded in `EddySymbol`'s header so the next large slot does
not rediscover it.

### P2 — The peek does not grow a tab strip; it swaps its whole body ~~Make loading growth feel intentional~~

**Corrected.** The original finding described the tab set growing from one tab to
five and recommended reserving the tab-strip height. That is not what happens.
`accessTabs()` returns `['overview']` alone until the detail request lands, and
`PinSheet`'s `activeTabs.length <= 1` guard routes that state to `PinCallout` — a
different component. So on every access point the peek replaces its entire body
about half a second after opening: callout out, `PinSheetHeader` plus chrome plus
tab bar in, after which `MapSheet` remeasures `peekHeight` and animates
`translateY` over 180 ms. Reserving a strip height does not touch that.

Half of it is fixed and half is deliberate. `PlaceHead` is now shared by both
peeks, so the swap can no longer change what the place looks like — the two used
to disagree about it, at 64 pt of photo against 44 pt, with their own copies of
the star and the close. The swap itself remains: collapsing `PinCallout` into the
tabbed header is a much larger change than this audit, and the callout is also
the whole sheet for hazards, outfitters and single-tab stations. **Reserving the
strip height is still not the fix** and was not implemented; the remaining work
is one peek body, not a placeholder for the difference between two.

### P2 — Share sheet primitives before styling drifts — shipped

`PlaceHead` owns the identity row and `AccessTypeBadges` the pills, so both are
written once. The action rows are still split between the callout's tone-resolved
button list and the header's two-button row — untouched, and the next thing to
merge if `PinCallout` is collapsed.

## Icon coverage

| Access role | Current coverage | Status |
| --- | --- | --- |
| Generic access | Eddy POI | Map default and header fallback |
| Campground | Eddy Campground | In badges and header fallback |
| Boat ramp | Eddy Boat Ramp source and 300 px app asset | Wired into badges and header fallback |
| Gravel bar | Missing | Next; it changes launch expectations and vehicle suitability |
| Bridge | Eddy Road is adjacent but not exact | Road stays the road-access section mark; label-only until Bridge exists |
| Park | Missing | Lowest priority; generic Access until Park has distinct product behavior |
| Put-in / take-out | Route start and finish map marks exist | Directional marks kept; not utility icons |
| Fee / private | Text states | Text badges; these are caveats, not place categories |

**Gravel Bar** is the only art still worth commissioning immediately — it is
trip-critical and visually distinct. Bridge becomes necessary only if every
canonical type takes a mark; Park can wait. Until then those three resolve to the
generic pin, never to an adjacent drawing.

Not added: a web twin of the boat ramp. `EddyIcon.tsx` has no surface that shows
access types, and shipping a second unused asset is the thing this audit already
caught once (`boatRamp` sat in `EddySymbol` referenced by nothing until
`placeSymbol` wired it).

## Boat Ramp asset

- `design/eddy-emoji/eddy-boat-ramp.png` — 1254×1254 source concept on the
  catalog's off-white card.
- `eddy-ios/assets/eddy/eddy-boat-ramp.png` — 300×180, paletted with `tRNS`.
- `boatRamp` role in `EddySymbol`, resolved by `placeSymbol`.
- Asset derivation and catalog documentation entries.

Coral launch ramp, compact boat entering river-blue waves, the catalog's thick
deep-teal outline. Mascot-free, and it does not replace the generic access map
pin.

## Remaining work

1. Generate Gravel Bar; decide whether Bridge warrants a dedicated mark.
2. Validate on 320 pt and 375 pt widths, dark mode, large text, reduced motion,
   and VoiceOver. The 320 pt case is the one to check first: the identity row now
   spends 44 pt on the frame and up to 88 pt on controls.
3. Decide whether `PinCallout` collapses into the tabbed header, which is what
   would end the peek swap rather than dressing it.
4. Wire Boat Ramp into the access lists outside this sheet (plan rows, nearby
   lists) if the mark earns its place there too.

Any change here runs `make check-web` and `make check-mobile`; `make
bundle-mobile` is what catches Metro breakage that dev hides. `app-theme.test.ts`
fails on any color inside a `StyleSheet.create`, so a theme color belongs inline
from `useTheme()` — `PlaceHead`'s white badge ring is the stated exception, for
the reason the map's `circleStrokeColor` is.

## What is already working well

Verified, not assumed:

- Peek/glance preserves a tappable map rather than turning selection into a modal.
- Transform-based motion avoids per-frame layout work.
- Reduced motion is honored in `MapSheet`, `SheetTabBar` and `SheetPager`.
- New content preserves the user's chosen detent.
- Dynamic tabs are held by stable keys rather than indices.
- Horizontal tab overflow has centering and an edge affordance.
- Condition colors and CTA colors use semantic theme roles.
- The CTA row already met the 44 pt floor.
- Missing data is omitted or explained instead of exposed as database-shaped
  "unknown" rows.
