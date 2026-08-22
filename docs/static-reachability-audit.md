# Static reachability audit

The repository has two independent npm roots, so it deliberately has two Knip
configurations and two commands. Do not introduce a root manifest or workspace.

```sh
make audit-dead-code
# or, from either app root:
npm run audit:dead-code
```

Both commands pin the same Knip release through `npx`; this avoids coupling the
independent lockfiles or making the mobile EAS/Vercel installs carry an audit-only
dependency. The default command uses `--no-exit-code`: the initial audit is a
**reporting check**, not a CI gate. Use `npm run audit:dead-code:strict` in an app
root when working findings down; it returns non-zero when findings remain.

## Reachability model

* The web configuration treats Next.js App Router conventions, manifest-invoked
  scripts, tests, and the Remotion configuration, entry module, generators, and
  visual test as roots. It reads both `tsconfig.json` and `tsconfig.test.json`, so
  test-only imports (including source outside the Vercel tree) count as reachable.
* The mobile configuration roots every Expo Router module and the source entries
  of all `file:` packages. Package-manifest commands are discovered by Knip.
* `ignoreIssues` is intentionally limited to exports consumed by Next.js, Expo
  Router, or Remotion through framework conventions. Never replace it with a
  global unused-export suppression.

## Initial finding classification and policy

The baseline findings fall into three groups: framework-discovered exports
(false positives covered by the narrow config list), test-only or manifest-only
imports (modeled as entries), and actionable unused files, exports, or package
dependencies. Actionable results must be verified against runtime filename
conventions, GitHub workflows, EAS, and Vercel before removal; dynamic loading
means an audit result alone is not proof of dead code.

The audit is not blocking in CI yet. The existing codebase needs its actionable
baseline reviewed without creating a noisy gate, and `npx` requires registry
access not needed by normal builds. Once both strict commands are clean and the
tool is available hermetically, add the strict variants to the corresponding CI
jobs. New findings should still be investigated during relevant changes rather
than added to the ignore list.
