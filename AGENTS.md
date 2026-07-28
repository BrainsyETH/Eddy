# Agent instructions

The canonical repository guide is [`CLAUDE.md`](CLAUDE.md) — repository map,
task routing, validation commands, and hard constraints. It is tool-neutral
despite the filename; read it before making changes.

Quick facts:

- Validate with `make help` / `make check-web` / `make check-mobile` /
  `make bundle-mobile` from the repository root.
- There is deliberately no root `package.json` — do not add one.
- Never use `--legacy-peer-deps` in `eddy-ios/`.
- `.easignore` is a security-critical allowlist; read its header before
  editing it.
