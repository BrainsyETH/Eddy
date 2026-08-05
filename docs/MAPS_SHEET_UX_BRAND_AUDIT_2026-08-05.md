# Maps sheet UX and brand audit

Reviewed against `origin/main` at `e1faa534` on 2026-08-05. This is a static audit of the latest iOS Maps sheet implementation and the existing native/App Store captures.

## Outcome

The interaction model is strong. The sheet preserves map context, moves on the compositor, respects reduced motion, keeps the selected tab stable while data arrives, and uses the product's semantic condition colors correctly.

The remaining inconsistency is mostly identity, not mechanics: the map uses recognizable Eddy utility art, then the selected-place sheet falls back to a tiny colored dot, generic text chips, and a 14 pt title. The sheet feels like a well-made system panel rather than unmistakably Eddy.

## Priority findings

### P0 — Resolve the conflicting color source of truth

`missouri-float-planner/.stitch/DESIGN.md` still defines Sunset Coral as the primary CTA color. The current native semantic palette explicitly reserves coral for brand/decorative emphasis and uses Deep River Teal for CTA fills so actions do not resemble river warnings.

Choose the native role split and update the shared design document:

- Deep River Teal: actions, links, selected navigation, trust surfaces.
- Sunset Coral: Eddy identity, illustration, small emphasis marks, non-action badges.
- Condition colors: river verdicts only.

Until this is corrected, both color choices can be defended by pointing at a repository source, which guarantees future drift.

### P1 — Give the selected place a branded identity

When a place has no photo, `PinSheetHeader` renders a 10 pt colored dot. On the map and in the layer sheet, the same content uses full Eddy utility symbols. This drops the brand at the moment of highest attention.

Recommendation:

- Use a 32–36 pt Eddy utility symbol as the no-photo fallback.
- Keep the live layer/condition color as a small badge or ring so the fixed-color art does not erase state.
- Use Boat Ramp, Campground, Gauge, Hazard, Outfitter, Dam, or generic Access according to the selected role.
- Keep photos when available, but use the same frame size and badge treatment as the icon fallback.

### P1 — Strengthen the glance hierarchy

The selected place name is currently `t.sm`/14 pt semibold, the same scale used by chip and tab labels. That makes the identity line compete with metadata and actions.

Recommendation:

- Place name: `t.base` or `t.lg`, `fonts.heading`, maximum two lines.
- Subtitle: `t.sm`, muted.
- Keep the one decision fact immediately below.
- Keep the CTA row at 44 pt minimum; the current implementation already meets this.

### P1 — Consolidate access-type badges

Access types appear as plain pills in `PinSheetDetail`, then appear again at the top of the Overview tab. The repetition spends limited sheet height without improving recognition.

Recommendation:

- Render one shared `AccessTypeBadges` component in the expanded chrome.
- Use icon + label for decision-useful types; text-only for secondary state such as fee or private access.
- Remove the duplicate type chips from Overview.
- Do not put six type icons on map pins. Multi-role points would become a legend test; keep the generic access pin on the map and disclose roles in the sheet.

### P1 — Guarantee real 44 pt utility targets

Star and close use a 19 pt glyph plus `hitSlop={12}`. This is close to the 44 pt target and usually works, but it does not create a measurable 44×44 layout target or visible pressed state.

Recommendation: wrap each in a 44×44 centered `Pressable`, add the existing pressed-opacity behavior, and keep the current accessibility labels.

### P2 — Make loading growth feel intentional

The tab set can grow from one tab to five after detail data arrives. The implementation correctly tracks selection by key, but the appearance of the tab strip and new destinations can still feel like layout instability.

Recommendation: reserve only the tab-strip height after the user expands the sheet, then fade in qualified tabs. Do not reserve empty page content or add a spinner.

### P2 — Share sheet primitives before styling drifts

Chip styling is duplicated between `PinSheet.tsx` and `sections.tsx`; action styling is split between the legacy callout and the newer glance header. Extract shared badge, icon-fallback, and action-row primitives before adding more pin types.

## Icon coverage

| Access role | Current coverage | Recommendation |
| --- | --- | --- |
| Generic access | Eddy POI | Keep as the map default and fallback |
| Campground | Eddy Campground | Keep |
| Boat ramp | New Eddy Boat Ramp source and 300 px app asset | Use first in sheet badges and access lists |
| Gravel bar | Missing | Create next; it changes launch expectations and vehicle suitability |
| Bridge | Eddy Road is adjacent but not exact | Reuse Road only for road-access sections; create Bridge if type badges become visual |
| Park | Missing | Lowest priority; generic Access is acceptable until Park has a distinct product behavior |
| Put-in / take-out | Route start and finish map marks exist | Keep directional marks; do not turn these states into utility icons |
| Fee / private | Text states exist | Keep as text badges; these are caveats, not place categories |

The only other icon I would consider immediately necessary is **Gravel Bar**. It is trip-critical and visually distinct. Bridge becomes necessary if every canonical access type receives an icon; Park can wait.

## Boat Ramp asset

Added:

- `design/eddy-emoji/eddy-boat-ramp.png` — 1254×1254 source concept on the catalog's off-white card.
- `eddy-ios/assets/eddy/eddy-boat-ramp.png` — 300×180 transparent, quantized app asset.
- `boatRamp` role in `EddySymbol`.
- Asset derivation and catalog documentation entries.

The icon uses a coral launch ramp and compact boat entering river-blue waves, with the existing thick deep-teal outline. It is intentionally mascot-free and does not replace the generic access map pin.

## Recommended implementation order

1. Correct the shared color-role document.
2. Add the branded header fallback and stronger title hierarchy.
3. Consolidate access-type badges and wire Boat Ramp into that component.
4. Fix star/close target sizing and pressed feedback.
5. Generate Gravel Bar; decide whether Bridge warrants a dedicated mark.
6. Validate on 320 pt and 375 pt widths, dark mode, large text, reduced motion, and VoiceOver.

## What is already working well

- Peek/glance preserves a tappable map rather than turning selection into a modal.
- Transform-based motion avoids per-frame layout work.
- Reduced-motion handling is present.
- New content preserves the user's chosen detent.
- Dynamic tabs are held by stable keys rather than indices.
- Horizontal tab overflow has centering and an edge affordance.
- Condition colors and CTA colors use semantic theme roles.
- Missing data is omitted or explained instead of exposed as database-shaped “unknown” rows.
