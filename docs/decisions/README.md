# Decision records

Short records of structural decisions that look like accidents but are
load-bearing. Each links to the authoritative in-tree explanation rather than
duplicating it. Statuses: `active` (still binding), `superseded` (see
successor), `historical` (context only).

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-no-root-npm-workspace.md) | No root `package.json` or npm workspace | active |
| [0002](0002-mobile-file-deps-plain-npm-ci.md) | Mobile uses `file:` deps and plain `npm ci`; `--legacy-peer-deps` forbidden | active |
| [0003](0003-conditions-package-lives-in-web-tree.md) | Canonical conditions package lives at `missouri-float-planner/shared/` | active |
| [0004](0004-easignore-is-an-allowlist.md) | `.easignore` is an allowlist and a security boundary | active |
