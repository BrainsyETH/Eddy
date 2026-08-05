# 0007 — The primary CTA fill is teal on native and coral on web

Status: active · 2026-08

`.stitch/DESIGN.md` gives Sunset Coral (`accent-500`, `#F07052`) as the primary
CTA colour, and the website means it: `.btn-primary` in
[`globals.css`](../../missouri-float-planner/src/app/globals.css) fills with
`var(--color-accent-500)`. The iOS app deliberately does not follow it. There,
`accentFill` is Deep River Teal and coral is reserved for Eddy's identity —
the otter, the bottom-line rule, the lock glyph, a "best value" sticker.

**Why the app diverges** is in the `accentFill` comment in
[`palette.ts`](../../eddy-ios/src/theme/palette.ts), and it is a collision, not
a preference: `CONDITION_SYSTEM` paints `dangerous` red-500 and `high`
orange-500, and on a screen whose whole job is saying whether the water is safe,
the loudest red-orange object was the button asking for money. Every other hue
on the ladder is spoken for — yellow `low`, lime `flowing`, emerald `good`,
stone `too_low` — so blue-teal is the only family in the palette that carries no
verdict about a river.

**Why the website keeps coral.** That argument is about density and adjacency,
and the two platforms do not share either. The app is a map with condition
colour on almost every surface, at arm's length, one thumb; the site's CTAs sit
in hero sections and marketing pages where no condition ladder is in frame.
Repainting the site teal would also make `interactive` and `accentFill` the same
family on a canvas that already uses teal for chrome, headers and links — the
form separation the app relies on (one filled pill per screen) is not something
a web page can promise.

**Consequence:** the two roles for coral are platform-scoped, and the scoping is
written down in three places that must agree — the `Accent` section of
[`.stitch/DESIGN.md`](../../missouri-float-planner/.stitch/DESIGN.md), the
`accent` / `emphasisFill` / `accentFill` comments in `palette.ts`, and this
record. `palette.ts` used to open by calling DESIGN.md "the design system of
record, not this file" while diverging from it 115 lines later, which is what
made the divergence look like drift.

This is not an invitation to fork the palette further. Everything else —
families, hex values, the type scale, the 44pt touch floor — is copied verbatim
from DESIGN.md, and a second exception needs a reason of this size and a note in
all three places.

Reopening it means deciding which platform moves. Repainting the app's CTAs
coral reintroduces the condition collision and is refused; repainting the site's
CTAs teal is arguable but is a visual migration across every marketing surface,
plus the ad canvases in DESIGN.md §10 that are built on the §8 accent gradient.
