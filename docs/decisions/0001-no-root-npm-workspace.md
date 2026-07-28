# 0001 — No root `package.json` or npm workspace

Status: active · 2026-07

The repository root deliberately has no `package.json`, lockfile, or npm
workspace, even though it contains two apps and shared packages.

- A root manifest would let `npx expo` run from the root resolve the latest
  Expo from the registry instead of the SDK version `eddy-ios/` pins — see
  "Run commands from inside `eddy-ios/`" in
  [`eddy-ios/README.md`](../../eddy-ios/README.md).
- Workspace hoisting would change what EAS archives and what Vercel installs;
  both deployments depend on per-app `node_modules` resolved from per-app
  lockfiles (see [ADR 0004](0004-easignore-is-an-allowlist.md) and the
  comments in [`.github/workflows/app-ci.yml`](../../.github/workflows/app-ci.yml)).

Cross-app code sharing is done with `file:` dependencies instead
([ADR 0002](0002-mobile-file-deps-plain-npm-ci.md)). The root `Makefile`
provides shared commands without touching dependency resolution.

Revisit only with a prototype proving green web CI, a production iOS bundle,
the `.easignore` check, and a Vercel preview.
