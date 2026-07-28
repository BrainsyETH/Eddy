# 0003 — The conditions package lives at `missouri-float-planner/shared/`

Status: active · 2026-07

The canonical condition system (`@eddy/conditions`) lives inside the web tree
rather than under `packages/` with its siblings, because Vercel installs and
builds **only** `missouri-float-planner/` — shippable web code cannot import
from outside that directory. The iOS app reaches the same code via a `file:`
dependency ([ADR 0002](0002-mobile-file-deps-plain-npm-ci.md)).

Consequence: editing `missouri-float-planner/shared/` changes both apps, and
CI runs both jobs on changes to either directory — the rationale is the
comment block at the top of
[`.github/workflows/app-ci.yml`](../../.github/workflows/app-ci.yml).

Moving it to `packages/eddy-conditions/` is attractive but is a deployment
migration: it requires proof via web CI, a production iOS bundle, the
`.easignore` check, and a Vercel preview before it can be accepted.
