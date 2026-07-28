# 0004 — `.easignore` is an allowlist and a security boundary

Status: active · 2026-07

EAS archives from the **git root** (Metro resolves `../packages` and
`../missouri-float-planner/shared`), so [`.easignore`](../../.easignore)
denies everything and re-admits only what Metro actually needs.

The security property: when `.easignore` exists, eas-cli stops reading
`.gitignore` entirely — every gitignored path, including `.env` files, would
be uploaded unless excluded here. An allowlist makes that safe by
construction: nothing is uploaded unless it is named.

The full explanation is the header of `.easignore` itself — read it before
any edit, and verify edits with `python3 eddy-ios/scripts/check-easignore.py`
(run automatically by CI and `make bundle-mobile`).

Do not "simplify" it into a denylist, and do not scope the archive down to
`eddy-ios/` — both break builds or leak secrets.
