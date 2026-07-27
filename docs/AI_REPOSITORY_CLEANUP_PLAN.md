# AI Repository Cleanup Plan

## Purpose

This document is the canonical roadmap for making the Eddy repository easier
for humans and AI coding tools to understand, change, and validate. The goal is
to reduce **time to correct context**: a contributor should be able to identify
the relevant subsystem, constraints, source of truth, and verification command
without searching the whole repository or reconstructing decisions from CI.

This is a documentation and repository-ergonomics program. It must not change
product behavior merely to make the tree look more conventional.

## Success measures

The cleanup is successful when a newly started coding agent can:

- identify `/eddy-app` as the product repository and report the correct Git
  status on its first attempt;
- route a web, mobile, database, ingestion, or shared-code task to the correct
  directory using only the root documentation;
- discover one documented command that performs the required checks for its
  change;
- understand the Vercel, Expo, EAS, and shared-package constraints before
  proposing structural changes;
- avoid generated output, research artifacts, and unrelated operational tools
  during ordinary source searches;
- distinguish current architecture from historical plans and audits.

Measure these outcomes with the onboarding exercise in the final Definition of
Done rather than with repository size alone.

## Current-state findings

The observations below were verified on July 27, 2026.

### Repository boundary is ambiguous

The product repository is `/Users/brainsy/Eddy/eddy-app`, but it is nested
inside a separate Git workspace at `/Users/brainsy/Eddy`. When a coding tool is
started from the outer directory, the entire product appears as an untracked
`eddy-app/` directory. That can produce incorrect Git status, irrelevant
instructions, misplaced files, and searches that cross two different scopes.

### Root-level product guidance is incomplete

The product repository has no root `README.md` or `AGENTS.md`. Its root
[`CLAUDE.md`](../CLAUDE.md) is focused on Stitch setup rather than repository
navigation, validation, architecture, or safety constraints. Tool-neutral
instructions therefore do not exist at the product boundary.

### Some documentation is stale

The [web README](../missouri-float-planner/README.md) describes Next.js 14 and
React 18, while the current package manifest declares Next.js 16 and React 19.
Its development-phase checklist also describes work that has since been
implemented. Stale documentation increases error rates because it looks
authoritative while contradicting executable configuration.

### Source, research, and operations are mixed

Research PDFs, a generated Compass artifact, application directories,
marketing material, design assets, and ClipEngine operations all compete for
attention near the repository root. Similar research PDFs are not byte-for-byte
duplicates and must be reviewed before consolidation; they must not be deleted
based on filename alone.

### Generated directories dominate the local tree

The web directory is approximately 2.4 GB in a populated checkout, primarily
because of ignored `node_modules/` and `.next/` content. Git-aware search tools
normally skip these paths, but generic filesystem traversal and some AI tools
may still inspect them unless the repository makes generated-file boundaries
explicit.

### Commands are fragmented

The web, iOS, and Remotion projects have separate manifests and lockfiles.
Important validation behavior is discoverable in package scripts and GitHub
Actions, but there is no stable repository-level entry point. Contributors must
already know which directory and install flags to use.

### Shared-code ownership is unconventional but intentional

Most cross-application packages live under `packages/`, while the canonical
conditions package lives at `missouri-float-planner/shared/`. The mobile app
uses local `file:` dependencies, and the current non-workspace design protects
both Vercel's configured web root and the EAS source archive. The layout is
awkward, but changing it without deployment validation is riskier than leaving
it documented.

## Constraints and non-goals

- Preserve `missouri-float-planner/` and `eddy-ios/` as physical directory
  names during the initial cleanup.
- Do not add an npm workspace or root `package.json` during the initial
  cleanup. A root `Makefile` may orchestrate existing commands without changing
  dependency resolution.
- Preserve all local `file:` dependency behavior used by Expo and EAS.
- Preserve Vercel's `missouri-float-planner/` Root Directory behavior.
- Preserve `.easignore` as a security-sensitive allowlist and continue running
  its existing validation.
- Do not combine, delete, or overwrite research artifacts until their content,
  provenance, and retention value have been reviewed.
- Do not move database migrations or seeds merely for visual consistency.
- Do not mix product refactors with repository cleanup. Structural changes
  should be independently reviewable and reversible.
- Do not replace authoritative executable configuration with manually copied
  version lists. Documentation should point to manifests when possible.

## Recommended logical structure

The first stages create a clear logical map while retaining deploy-sensitive
physical paths:

```text
eddy-app/
├── AGENTS.md                       # Canonical tool-neutral instructions
├── CLAUDE.md                       # Claude-specific additions and pointer
├── README.md                       # Product and repository entry point
├── Makefile                        # Stable command interface, no workspace
├── .gitignore                      # Repository-wide operating-system noise
├── docs/
│   ├── architecture.md
│   ├── development.md
│   ├── testing.md
│   ├── deployment.md
│   ├── data-pipeline.md
│   ├── decisions/
│   ├── research/
│   ├── runbooks/
│   └── archive/
├── missouri-float-planner/         # Logical role: apps/web
│   ├── AGENTS.md
│   ├── src/
│   ├── shared/
│   ├── scripts/
│   └── supabase/
├── eddy-ios/                       # Logical role: apps/mobile
│   ├── AGENTS.md
│   ├── app/
│   └── src/
├── packages/                       # Cross-application pure modules
├── tooling/                        # Repository-wide operational tooling
├── design/
└── marketing/
```

`apps/web` and `apps/mobile` are conceptual names only in this phase. They
should be used in diagrams and prose to make responsibilities obvious without
breaking deployment paths.

## Task-routing matrix

| Change type | Start here | Read before editing | Required validation |
| --- | --- | --- | --- |
| Web page, API route, or server behavior | `missouri-float-planner/src/` | Root and web `AGENTS.md` | `make check-web` |
| Web database access or schema change | `missouri-float-planner/supabase/` and `src/` | Database guidance and migration conventions | `make check-web` plus documented database validation |
| iOS route, component, hook, or native configuration | `eddy-ios/app/` and `eddy-ios/src/` | Root and mobile `AGENTS.md` | `make check-mobile` and `make bundle-mobile` |
| River-condition behavior | `missouri-float-planner/shared/` | Architecture dependency map | `make check-web` and `make bundle-mobile` |
| Shared types, geo, hazards, offline, or sync logic | `packages/` | Package README or package-local guidance | `make check-web` and `make bundle-mobile` |
| Data ingestion or correction | `missouri-float-planner/scripts/` | `docs/data-pipeline.md` and the script catalog | Targeted dry run, data validation, then `make check-web` |
| Supabase migration or seed | `missouri-float-planner/supabase/` | Migration and environment safety guidance | Local/preview migration validation; never default to production |
| ClipEngine or social media automation | `clipengine-local/`, `scripts/clipengine/`, or `scripts/social/` until consolidated | Relevant runbook | Tool-specific dry run and existing workflow validation |
| Design or marketing artifact | `design/` or `marketing/` | Directory README | Asset-specific review; application checks only if code references change |
| CI or deployment | `.github/workflows/`, `.easignore`, Vercel configuration | `docs/deployment.md` | Workflow syntax, web checks, mobile bundle, and EAS allowlist check as applicable |

Commands in this table describe the target interface created in Phase 3.

## Phase 1: Clarify the repository boundary and coding root

### Purpose

Ensure every contributor starts in the actual product repository and reads Git
state from the correct root.

### Deliverables

- Document `/eddy-app` as the product Git root in both the outer workspace and
  product repository entry points.
- Configure local editor/workspace files to open `eddy-app/` directly where
  practical. Keep personal editor settings untracked unless they are portable
  and useful to all contributors.
- Decide operationally between these two supported arrangements:
  1. preferred: place the product checkout beside the assistant workspace; or
  2. retained nesting: keep `eddy-app/` nested and add an explicit outer-root
     warning that it is an independent repository.
- Add a safe diagnostic command to the documentation:
  `git rev-parse --show-toplevel`, whose expected result ends in `/eddy-app`.
- Add a repository-root `.gitignore` entry for `.DS_Store`; remove the already
  tracked `.DS_Store` in a dedicated cleanup commit only after confirming that
  no user data is involved.

### Risks

- Physically moving a checkout can invalidate editor workspace paths, local
  scripts, or uncommitted-file assumptions.
- Treating the outer workspace as the product repository can stage unrelated
  personal memory or configuration.

### Validation

- From the intended coding directory, confirm `git rev-parse --show-toplevel`
  resolves to the product repository.
- Confirm `git status --short` reports only product changes.
- Search documented commands for obsolete absolute paths after any checkout
  move.

### Completion criteria

- A fresh coding session identifies the product Git root without inspecting the
  outer workspace.
- Operating-system metadata no longer appears as a tracked product change.

## Phase 2: Add canonical and scoped AI instructions

### Purpose

Give every coding tool the same concise repository rules, then add only the
subsystem context required for a specific task.

### Deliverables

- Add a root `AGENTS.md` as the canonical source of truth. Keep it concise and
  operational: repository map, task routing, validation commands, security
  boundaries, generated-file rules, and critical deployment constraints.
- Replace root `CLAUDE.md` with a short pointer to `AGENTS.md` plus genuinely
  Claude- or Stitch-specific instructions. Do not maintain two independent
  copies of repository rules.
- Add scoped `AGENTS.md` files to `missouri-float-planner/` and `eddy-ios/`.
  Each should cover local entry points, architecture patterns, forbidden
  changes, and required validation without repeating the full root document.
- Add package-local guidance only where a package has surprising invariants.
  Prefer a package README when the information is useful to humans as well as
  agents.
- State which paths are generated, vendored, archival, secret-bearing, or
  unsafe to mutate automatically.
- Include a rule to inspect existing state and obtain explicit authorization
  before production database writes, deployments, external messages, or secret
  changes.

### Risks

- Repeated instructions drift and eventually conflict.
- Excessive instruction files consume context and obscure the few constraints
  that actually matter.
- Tool-specific syntax may not be understood by other coding systems.

### Validation

- Compare root and scoped guidance for contradictions.
- Give a clean agent one representative web task and one mobile task; verify it
  selects the right directories and checks without additional prompting.
- Confirm all commands named in guidance exist and succeed in their documented
  working directories.

### Completion criteria

- `AGENTS.md` is the single tool-neutral authority.
- Scoped guidance adds local facts rather than duplicating root prose.
- An agent can state the web/mobile/shared dependency boundaries before editing.

## Phase 3: Add a stable root command interface

### Purpose

Make setup and validation discoverable without changing package installation or
deployment behavior.

### Deliverables

- Add a root `Makefile`; do not add a root package manifest or npm workspace.
- Provide these stable targets:
  - `make help`: list targets and explain whether they read, build, or clean;
  - `make setup-web`: run `npm ci` in `missouri-float-planner/`;
  - `make setup-mobile`: run `npm ci --legacy-peer-deps` in `eddy-ios/`;
  - `make check-web`: run web typecheck, lint, and unit tests;
  - `make check-mobile`: run mobile typecheck and lint;
  - `make bundle-mobile`: run the same credential-free iOS export exercised by
    CI, followed by the `.easignore` allowlist check;
  - `make check`: run `check-web`, `check-mobile`, and `bundle-mobile`;
  - `make clean-generated`: remove only an explicit allowlist of reproducible
    outputs after printing the target paths.
- Keep every target a thin wrapper over an existing package script or CI
  command. Application manifests remain the implementation-level authorities.
- Ensure temporary mobile bundle output is written outside tracked source or to
  an already ignored, dedicated build directory.
- Document Node 20 and the mobile `--legacy-peer-deps` requirement prominently.

### Risks

- A root command can conceal differences from CI if it reimplements rather than
  invokes the same checks.
- Cleanup targets are destructive if their path allowlist is broad or derived
  from unresolved variables.
- A full `make check` may be too slow for every edit, so subsystem targets must
  remain first-class.

### Validation

- Compare each Make target with `.github/workflows/app-ci.yml` and package
  scripts.
- Run `make help`, both subsystem checks, and the mobile bundle in a clean
  checkout.
- Confirm dependency installation still occurs separately in web and mobile.
- Confirm no root `node_modules/`, root lockfile, or workspace metadata appears.

### Completion criteria

- One documented command reproduces the relevant CI gate for each task type.
- The root interface does not alter Vercel, npm, Metro, Expo, or EAS resolution.

## Phase 4: Correct and consolidate documentation

### Purpose

Create a small, current documentation path and clearly distinguish active
guidance from historical evidence.

### Deliverables

- Add root `README.md` covering product purpose, deployable applications,
  logical repository map, quick start, common validation commands, and links to
  detailed documentation.
- Update the web and mobile READMEs to derive version claims from their package
  manifests and to describe current behavior rather than obsolete phases.
- Add focused documents for architecture, development, testing, deployment, and
  the data pipeline. Avoid one giant handbook.
- Add `docs/decisions/` for short architectural decision records. The first
  records should explain:
  - why there is no root npm workspace;
  - why mobile uses `file:` dependencies;
  - why the canonical conditions package currently lives in the web tree;
  - why `.easignore` is an allowlist and security boundary.
- Add status metadata to audits and plans: owner, date, status (`active`,
  `superseded`, or `historical`), and successor document where applicable.
- Move obsolete plans into `docs/archive/` without erasing provenance.
- Replace duplicated facts with links to executable configuration or a single
  authoritative document.

### Risks

- Documentation-only claims can drift from manifests and workflows.
- Archiving an active plan can make current work undiscoverable.
- Moving documents can break inbound repository links.

### Validation

- Validate all relative Markdown links.
- Compare setup and check commands against current manifests and CI.
- Search for outdated framework versions and retired phase language.
- Confirm moved documents retain Git history and have redirects or updated
  references where needed.

### Completion criteria

- Root README answers “what, where, setup, check, deploy constraints” within two
  minutes.
- Active documentation contains no known contradictions with executable config.

## Phase 5: Organize research, operations, and generated artifacts

### Purpose

Keep ordinary source discovery focused while preserving valuable research and
operational material.

### Deliverables

- Inventory every root-level PDF and generated Markdown artifact with source,
  date, subject, owner, and current relevance.
- Move retained external evidence to `docs/research/` using descriptive names:
  `YYYY-MM-source-subject[-revision].pdf`.
- Compare the similarly named data-gap PDFs by content. Retain both with clear
  revision labels if materially different; otherwise retain the authoritative
  copy and record the removed duplicate in the cleanup commit message.
- Rename the UUID-based Compass Markdown artifact by subject and provenance;
  place it in `docs/research/` or `docs/archive/` based on status.
- Consolidate ClipEngine and social automation under `tooling/` only after
  inventorying workflow, documentation, and path references. Preserve local
  secret-loading boundaries and executable permissions.
- Add README files to `design/`, `marketing/`, and `tooling/` describing what is
  source, what is generated, and how outputs are reproduced.
- Keep large reproducible outputs ignored. Add an optional `.ignore` only if a
  supported search tool needs exclusions beyond `.gitignore`; do not hide source
  files to improve benchmarks.

### Risks

- Similar filenames do not prove duplicate content.
- Workflow path filters, scripts, or documentation may depend on current paths.
- Reorganizing operations can accidentally expose local secrets or break file
  permissions.

### Validation

- Hash and content-review candidate duplicates before removal.
- Search the entire tracked repository for every moved path and update all
  references in the same commit.
- Run affected workflow validation and tool-specific dry runs.
- Confirm no environment files, credentials, build output, or media render
  output become tracked.

### Completion criteria

- Product source, research evidence, generated output, and operational tooling
  have distinct, documented homes.
- Root filenames are descriptive and no UUID-only artifact remains unexplained.

## Phase 6: Categorize data and ingestion scripts

### Purpose

Make the large script inventory safe to navigate and operate, especially where
scripts can mutate local or remote data.

### Deliverables

- Create `docs/data-pipeline.md` with a catalog of every script family, its data
  source, output, environment, mutation level, idempotency, and validation path.
- Standardize script headers or adjacent documentation with:
  purpose, required variables, read/write behavior, dry-run support, expected
  duration, restart behavior, and output artifacts.
- Converge on these categories under `missouri-float-planner/scripts/`:
  - `ingestion/`: fetch and import external datasets;
  - `validation/`: checks, audits, smoke tests, and comparisons;
  - `maintenance/`: explicit corrections and one-time repair tools;
  - `generation/`: reproducible static assets and derived datasets;
  - `security/`: security policy checks and related tests.
- Move scripts one category at a time with `git mv`, updating package scripts,
  imports, docs, and workflows in the same change.
- Give mutating scripts a dry-run mode where technically feasible. When a dry
  run is impossible, require an explicit environment or confirmation flag and
  document rollback or recovery.
- Keep migrations and canonical seeds under `supabase/`; catalog them from the
  data-pipeline document instead of relocating them.

### Risks

- Relative imports, asset paths, or package scripts may silently depend on the
  current working directory.
- “Maintenance” scripts may encode historical assumptions and be unsafe against
  the current schema.
- A dry run that skips validation can create false confidence.

### Validation

- Build an old-path-to-new-path manifest before each batch of moves.
- Resolve every package-script, import, workflow, and documentation reference.
- Run each moved validation/generation script against local fixtures or a safe
  environment.
- Confirm mutating scripts refuse to target production by default.

### Completion criteria

- A contributor can determine whether a script is read-only or mutating before
  running it.
- Every active script is cataloged, categorized, and has a verification path.

## Phase 7: Evaluate shared-package normalization separately

### Purpose

Decide whether architectural consistency justifies moving the canonical
conditions package and, later, adopting conventional `apps/` paths.

### Deliverables

- Write an ADR evaluating
  `missouri-float-planner/shared/` to `packages/eddy-conditions/`.
- Prototype the move on an isolated branch and record required changes to web
  imports, TypeScript configuration, Metro, npm local dependencies, EAS archive
  contents, tests, and Vercel builds.
- Require successful web CI, mobile production bundle, EAS allowlist validation,
  and a Vercel preview before approving the migration.
- Evaluate `missouri-float-planner/` to `apps/web/` and `eddy-ios/` to
  `apps/mobile/` only after shared-package normalization is settled. Treat these
  as deployment migrations, not cosmetic renames.
- Do not combine directory renames, workspace adoption, or package-manager
  changes. Each requires its own ADR and rollback plan.

### Risks

- Local development can succeed while EAS production bundling fails.
- Vercel Root Directory and install behavior can change when package boundaries
  move.
- Metro may fail to index or resolve files outside the mobile project even when
  hot reload appears healthy.

### Validation

- Reproduce all checks from CI, including credential-free iOS export.
- Inspect the EAS archive to confirm all local dependencies are included and no
  secrets or unrelated media are uploaded.
- Produce a Vercel preview and exercise representative API and web routes.
- Document rollback steps before merging any structural migration.

### Completion criteria

- The move is accepted or rejected by an ADR containing measured deployment
  evidence.
- No structural migration is approved solely because the resulting tree looks
  more conventional.

## Recommended implementation order

Implement the phases as small, independently reviewable changes:

1. **Boundary and hygiene:** clarify the correct Git root and stop tracking
   operating-system metadata.
2. **Navigation:** add root README and canonical/scoped `AGENTS.md` files.
3. **Commands:** add and validate the root Make interface.
4. **Truth repair:** correct stale README content and add architecture,
   testing, deployment, and decision documents.
5. **Artifact organization:** inventory, rename, and move research and
   operational material without deleting ambiguous evidence.
6. **Script safety:** catalog first, then reorganize scripts in small batches.
7. **Architecture evaluation:** prototype shared-package or application-path
   migrations only after the low-risk cleanup has landed.

Do not combine all phases into one pull request. Phases 1–4 can be split into
small documentation/tooling changes; Phases 5–7 require dedicated reviews
because path movement can affect automation and deployment.

## Definition of Done

The repository-cleanup program is complete when all of the following are true:

- The product Git root is unambiguous in normal editor and agent workflows.
- Root and scoped guidance route tasks without conflicting instructions.
- Root documentation accurately reflects executable manifests and deployment
  constraints.
- `make check-web`, `make check-mobile`, `make bundle-mobile`, and `make check`
  reproduce their documented gates.
- Generated output, research, operations, source, and archival documents have
  distinct documented boundaries.
- Active scripts are categorized and disclose mutation behavior before use.
- Every physical architecture migration has its own ADR and deployment proof.
- A clean agent, given only the repository and a representative task, can in no
  more than five minutes identify:
  1. the correct Git root;
  2. the owning subsystem;
  3. the primary files to inspect;
  4. the constraints it must preserve; and
  5. the exact validation command to run.

That onboarding exercise should be repeated after major repository changes. A
regression in time-to-context is a documentation or structure defect even when
the application still builds.
