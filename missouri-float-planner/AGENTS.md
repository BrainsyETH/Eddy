# Web app — agent entry point

Read the root [repository guide](../CLAUDE.md) first, including its Product
and UI working agreement. This file routes web work; `CLAUDE.md` in this
directory imports it. Keep Eddy-specific guidance outside the generated
Next.js block below.

## Where to start

- **UI, copy and brand:** read the relevant sections of
  [the design system](.stitch/DESIGN.md) and [README.md](README.md), then inspect
  the existing component and its callers. Reuse the tokens in
  [`src/app/globals.css`](src/app/globals.css), the existing Eddy icons/artwork,
  and shared components. Web and native CTA roles intentionally differ; see
  [ADR 0007](../docs/decisions/0007-cta-fill-is-teal-on-native-coral-on-web.md).
- **Feature behavior:** use the matching README section (navigation,
  Conditions, Floats, route map, river sections, history, dam pages or lakes).
  For embeds, start with [docs/embeds.md](docs/embeds.md). Read only the sections
  relevant to the task and check their claims against the current code.
- **API and shared logic:** trace existing callers, including installed iOS
  clients, before changing response shapes or meanings. Follow the root
  guide's validation routing for `shared/` changes.

## Validation

Run `make check-web` from the repository root for code changes. Browser suites
are separate: run the ones covering the affected behavior from this directory,
then inspect the rendered result at mobile and desktop sizes. Existing suites
include:

| Affected surface | Additional checks (`npm run …`) | CI coverage |
| --- | --- | --- |
| Navigation, home and links between trip flows | `test:navigation` | Manual |
| Planner map | `test:planner-map` | Partial CI: national gauges only; full suite is manual |
| Float finder | `test:float-finder` | Manual |
| Conditions directory | `test:conditions` | Manual |
| River guides or river sections | `test:guides` / `test:river-sections`, as affected | App CI |
| Dam pages or lake experience | `test:dam-page` / `test:lakes`, as affected | Manual |
| Camping search, filters or availability | `test:camping-browser`; also `test:camping-capacity` for catalog/loading changes | App CI |
| Admin workspace | `test:admin-browser`; also `test:admin-db` for migration safeguards | App CI |
| Analytics instrumentation or audit harness | `test:analytics-browser` | App CI |
| App invitations and download links | `DAM_SMOKE_APP_ONLY=1 npm run test:dam-page` | App CI |

**Manual** means no committed CI workflow runs that full suite; run it for
relevant changes rather than assuming a green CI result covers it. **App CI**
refers to [app-ci.yml](../.github/workflows/app-ci.yml), not whether a check is
required by branch protection. The planner's partial coverage is in
[River Map Smoke](../.github/workflows/mosw-smoke.yml): its path-filtered job
runs `test:national-gauges`, which invokes the planner script with
`NATIONAL_GAUGES_ONLY=1` and skips the other planner checks.

The [package scripts](package.json), [README](README.md), and each script's
header describe fixtures, prerequisites and output paths; the table is routing,
not a requirement to run every suite on every change. For a changed flow that
the existing suites do not cover, exercise it directly. Report missing coverage
and verification limits. For production browsing, follow the root guide's
audit-harness rule and retain the visit log with the evidence.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
