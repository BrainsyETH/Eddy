# 0016 — Native dark appearance uses neutral charcoal

Status: active · 2026-10

Dark teal cards and teal supporting text made the iOS app feel uniformly blue
and weakened the distinction between content and actions. Canonical condition
inks were also too dark on translucent badge fills over dark surfaces, while
photo-backed Premium Reads retained bright light panels in dark appearance.

The native dark palette now has three neutral surface levels: canvas
`#161615`, cards `#242423`, and foreground sheets / raised surfaces `#333331`.
Titles use `#F5F5F0`, body prose `#DEDED8`, supporting text `#C3C3BD`, and
metadata `#B5B5AF`. The approved direction keeps subtle warmth without a blue
cast. Use semantic roles from `useTheme()`; colors do not belong in static
StyleSheets. The authoritative values are in
[`palette.ts`](../../eddy-ios/src/theme/palette.ts) and
[DESIGN.md](../../missouri-float-planner/.stitch/DESIGN.md).

Teal continues to identify actions, selections and data. The native teal CTA
decision in [ADR 0007](0007-cta-fill-is-teal-on-native-coral-on-web.md) remains
in force. Light appearance keeps its warm palette, and native iOS tabs keep
the system material.

Condition presentation stays derived from `CONDITION_SYSTEM`. Native helpers
require the current appearance: light retains canonical tint, ink and border;
dark uses an opaque tint over charcoal and a lighter version of the same hue
for text. Solids, labels, severity orderings and thresholds do not change.
Opaque badges and Premium Read panels preserve contrast over photos and maps.
Read loading, empty, error and retry states follow the panel's appearance.

The shared app-theme tests require at least 4.5:1 for supporting text, 7:1 for
dark body text and every dark condition label, and a clear title/body/supporting
hierarchy. Increase Contrast strengthens text and boundaries. These automated
checks verify color pairs; device verification remains a separate gate.

Before recording this as device-verified, inspect Today, Reads, river and gauge
detail, alert conditions, and foreground sheets on an iPhone in both appearances,
including Increase Contrast, Reduce Transparency and a live appearance switch.
This record does not establish a release or device-verification status.
