---
name: eddy-ios-ui
description: Design and refine Eddy iOS interfaces using the existing theme, native navigation conventions, accessible states, reusable components, and focused visual QA.
---

# Designing and refining Eddy's iOS experience

Use alongside `eddy-ios-feature` for screens, cards, flows, sheets, icons, or visual polish; this is an implementation checklist, not a replacement for `eddy-review`.

## Read before editing

- Read `CLAUDE.md`, `eddy-ios/AGENTS.md`, and the relevant `eddy-ios/README.md` sections (*Theming*, *Condition colours and labels*, *Maps (Mapbox)*, or *Adding a screen, and the generated route types*). Read related decisions from `docs/decisions/` only when the task touches them.
- Inspect existing Eddy screens/components and native presentation before introducing a new pattern. Follow existing design tokens, typography, icon families, and component primitives; avoid one-off color or spacing systems.
- Ask what the user needs to identify and do in the first glance. Surface the primary action and useful river/route facts before explanatory prose; push supplementary detail into the appropriate detail view.

## Interaction and navigation

- Prefer native iOS affordances, clear back/dismiss paths, consistent sheet detents, and a single tap to select an obvious choice. Avoid redundant pickers and confirmation taps when the user has already selected a river or granted location access.
- Keep route-selection, map-sheet, and return navigation responsive. Do not mount Mapbox for a list-only task when an existing lightweight route can serve it. Do not toggle navigation header visibility dynamically inside a modal if it remounts the screen.
- Include loading, empty, error, cached/offline, permission-denied, disabled, and repeated-tap states where relevant. Preserve the current selection on a failed request; avoid flashing fallback content while real data loads.
- Make tap targets comfortable (aim for at least 44 x 44 pt), labels legible, actions screen-reader understandable, and controls reachable with larger Dynamic Type. Check Safe Area insets, keyboard/sheet overlap, and scrolling/back gestures.

## Eddy-specific visual contract

- Use the theme hook and existing semantic colors for light, dark, and high-contrast modes. The README forbids freezing theme colors inside `StyleSheet.create` at import time; use dynamic colors from `useTheme()`.
- Condition-color meaning must match the canonical system. Don't use a condition color for unrelated decoration, and never hide conditions, gauges, or safety information behind Premium.
- Preserve stable numeric reading layouts, sensible truncation, scan-friendly card hierarchy, appropriate imagery when already available, and descriptive labels for custom Eddy icons.
- Favor calm, modern native iOS layout over crowded explanatory text or gratuitous symbols. Use Eddy personality when it improves recognition, not at the expense of clarity.

## Verify and hand off

- Review the screen in light/dark appearance, large text, and with an accessible reading order. Exercise primary action, back/dismiss, loading/empty/error, and offline states. For maps and Float Mode, flag simulator limitations and require physical-device checks where needed.
- Run the checks required by `CLAUDE.md` for touched paths (iOS code: `make check-mobile`, `make bundle-mobile`, `make check-web`). Do not label a visual state tested unless it was actually exercised.
- In the handoff, name the user-visible before/after, reused components, checks run, remaining device QA, and any new-binary requirement. Treat suggestions outside the requested scope as follow-ups, not surprise changes.
