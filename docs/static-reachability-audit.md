# Static reachability audit

Knip reports what nothing reaches: unused files, unused exports, and manifest
dependencies no import resolves to. It is a **reporting check**, not a CI gate,
and the baseline below is why.

```sh
make audit-dead-code
# or, from either app root:
npm run audit:dead-code          # reports, always exits 0
npm run audit:dead-code:strict   # exits non-zero while findings remain
```

## Why knip is a devDependency and not `npx`

The first version of this ran `npx --yes knip@<version>` in both roots, to avoid
adding an audit-only dependency to two lockfiles. It could not work: `npx`
installs knip into an isolated directory, and knip imports `typescript` — which
Node's ESM resolution looks for next to knip, never in the project. Every
invocation died with `ERR_MODULE_NOT_FOUND: typescript`. Passing
`-p typescript` alongside does not help; npm resolves only the first package.

A devDependency also pins better than the `npx` form did. The version is in each
lockfile with an integrity hash, which matches how this repo pins its GitHub
Actions to SHAs, and the audit no longer needs registry access at run time.

## Three npm roots, not two

`missouri-float-planner/remotion/` has its own `package.json`. Auditing it from
the web root — as the first version of the web config did — produced roughly
sixty `unlisted dependency: remotion` findings and counted its internals as
unused files, because every import there resolves against a manifest the web
root cannot see. It is excluded, and **nothing under `remotion/` is audited
today.** Giving it a third config and command is separate work.

## Reachability model

* Web: Next.js App Router conventions, tests, and **every file under
  `scripts/`** are entries. The scripts matter — knip finds the ones wired to
  `npm run db:*` by itself, but the hand-run ones (`discover-usace-locations.ts`
  and friends, which say in their own headers that they stay out of CI because
  they need the network) are entry points too. Modelling only the
  manifest-named ones reported 40+ live maintenance scripts as dead code.
* Mobile: every Expo Router module, plus the source entries of the `file:`
  packages. The shared tree's **tests are excluded** — they belong to the web
  runner, so from this root they are unreachable by construction.
* `ignoreDependencies` covers `@eddy/*` in both roots. Those packages resolve
  through tsconfig paths and Metro rather than through either manifest, so knip
  is right that they are unlisted and wrong that it means anything.
* `ignoreIssues` stays limited to exports consumed by Next.js or Expo Router
  through framework conventions. Never replace it with a global unused-export
  suppression.

## The baseline

Measured on `main`, 2026-08-22, after the config corrections above. The first
number is what the original config reported; the second is what survives once
the three structural errors are fixed.

| | Web (original → tuned) | Mobile (original → tuned) |
| --- | --- | --- |
| Unused files | 70 → **27** | 13 → **3** |
| Unused exports | 195 → **172** | 89 → **89** |
| Unused exported types | 335 → **324** | 88 → **88** |
| Unlisted dependencies | 84 → **9** | 1 → **1** |
| Unused dependencies | 7 → **7** | 5 → **0** |
| **Total** | 692 → **540** | 197 → **182** |

Roughly 720 findings remain. That is the honest answer to "how far is strict",
and it is a long way: the exports-and-types long tail is ~670 of it.

The 27 remaining web files and 3 mobile files are the part worth reading first,
and the first one read is already a real finding rather than a modelling gap:

**The chat component tree is orphaned.** `ChatBubble` → `ChatPanel` →
`ToolCards` / `useChat` is a complete subtree that nothing imports. `ChatPanel`'s
own header says it is "used inside ChatBubble (widget) and /chat (full page)";
`/chat/page.tsx` exists but is a static landing page that imports none of it,
and nothing anywhere imports `ChatBubble`. `/api/chat/route.ts` is still there
and still live. This is also why `react-markdown` shows up as an unused
dependency — its only importer is `ChatPanel`. Whether the answer is deleting
the components or re-mounting them is a product question, not an audit one.

The rest of the list:

```
src/app/FloatEstimator.tsx              src/components/home/QuickStartCards.tsx
src/components/river/RiverFilters.tsx   RiverHeader.tsx, RiverCardGrid.tsx
src/components/home/FloatingWellNow.tsx src/components/gauge/SparklineChart.tsx
../packages/eddy-geo/route-preview.ts   shared/condition-copy.ts, trend-meta.ts
```

**Findings are still not proof.** Dynamic imports, filename conventions,
workflow invocations, EAS and Vercel all defeat static reachability. Verify
before deleting anything — the chat tree above was confirmed by hand, not
taken from the report.

## Policy

Not a CI gate yet, and not close. Turn on the strict variants per root only
once that root reports clean; adding a gate at 540 findings would mean a
permanently red job or a suppression list large enough to hide the next real
finding. Investigate new findings during the changes that cause them rather
than appending to `ignoreIssues`.
