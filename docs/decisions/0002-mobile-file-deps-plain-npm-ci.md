# 0002 — Mobile uses `file:` dependencies and plain `npm ci`

Status: active · 2026-07

`eddy-ios/package.json` consumes shared code as `file:` dependencies
(`@eddy/conditions` from `../missouri-float-planner/shared`, plus the five
`../packages/*` modules). This works with Metro's watch roots, survives EAS
archiving, and needs no workspace ([ADR 0001](0001-no-root-npm-workspace.md)).

Install with plain `npm ci`. **`--legacy-peer-deps` is forbidden**: it does
not skip one bad peer, it skips peer installation entirely, silently removing
shipped native packages (`react-native-reanimated`,
`react-native-gesture-handler`, `react-native-worklets`). The one genuinely
conflicting peer (`react-dom`) is constrained by the `overrides` block in
`eddy-ios/package.json` instead.

Authoritative explanations: the mobile-job comments in
[`.github/workflows/app-ci.yml`](../../.github/workflows/app-ci.yml) and the
top of [`eddy-ios/README.md`](../../eddy-ios/README.md).
