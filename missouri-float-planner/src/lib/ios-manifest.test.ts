// src/lib/ios-manifest.test.ts
// Two of eddy-ios's hard constraints, enforced instead of documented.
//
// Both are stated in CLAUDE.md and in the mobile-job comments of app-ci.yml,
// and until now nothing checked either. They live in the WEB suite for the
// reason every other cross-app test does: eddy-ios has no runner, so a rule
// that only lives there cannot be covered. Same arrangement as app-theme.test.ts
// and the @eddy/geo tests.
//
// This file reads the manifest as DATA. It is not a lint rule and it does not
// care about formatting — it cares that two specific invariants hold.

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const IOS_ROOT = join(process.cwd(), '..', 'eddy-ios');

function manifest(): {
  dependencies: Record<string, string>;
  overrides?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(IOS_ROOT, 'package.json'), 'utf8'));
}

test('react-dom is pinned to exactly the react version', () => {
  // ── Why this is not `$react` ─────────────────────────────────────────────
  // It was, and it had to stop. npm's `$name` override reference cannot be
  // resolved while ADDING an Expo native module — `npm error Unable to resolve
  // reference $react` — so `npx expo install <anything>` failed outright on
  // this project. Reproduced with expo-image-picker and expo-image-manipulator
  // independently, so it is the reference expansion and not one package.
  //
  // The literal version restores installability and loses the property the
  // reference existed for: that bumping react carries react-dom with it. This
  // test is that property, moved from npm's resolver to CI. Bump react without
  // bumping the override and this goes red rather than shipping two React
  // copies into a bundle.
  const pkg = manifest();
  const react = pkg.dependencies.react;
  const override = pkg.overrides?.['react-dom'];

  assert.ok(react, 'eddy-ios must depend on react');
  assert.equal(
    override,
    react,
    `overrides["react-dom"] (${override}) must equal dependencies.react (${react}). ` +
      'They are one version by design — see the note above.',
  );
});

test('eddy-ios does not carry a legacy-peer-deps .npmrc', () => {
  // The other hard constraint, and the more dangerous one. Installing this app
  // with --legacy-peer-deps silently drops shipped native packages; the
  // overrides block above is the sanctioned fix. An .npmrc turning it on
  // repo-wide would apply it to every install anyone ever ran here, including
  // CI's, and nothing would say so.
  //
  // NOTE the web app legitimately HAS legacy-peer-deps=true in its own .npmrc.
  // That is a different install root and not this test's business.
  const npmrc = join(IOS_ROOT, '.npmrc');
  if (!existsSync(npmrc)) return; // The expected state.

  const text = readFileSync(npmrc, 'utf8');
  const offending = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^legacy-peer-deps\s*=\s*true$/i.test(line));

  assert.deepEqual(
    offending,
    [],
    'eddy-ios/.npmrc must not enable legacy-peer-deps — it silently removes ' +
      'shipped native packages. Use the overrides block instead.',
  );
});

// ── Native modules must not be imported at screen module scope ─────────────

/** Every .tsx under eddy-ios/app, recursively. */
function screenFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return screenFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

test('no screen imports PhotoSubmitSheet directly', () => {
  // PhotoSubmitSheet imports expo-image-picker at module scope. Both are NATIVE
  // modules, so on a binary built before they existed the import throws
  // `Cannot find native module 'ExponentImagePicker'` — and it throws while the
  // IMPORTING SCREEN is loading, not when the sheet opens. That killed the
  // whole river screen: no hazards, no put-ins, no reading, over a feature
  // nobody had touched.
  //
  // A React error boundary cannot catch it, because it happens during module
  // evaluation rather than during render. The only fix is to not evaluate the
  // module until someone opens the sheet, which is what PhotoSubmitSheetLazy
  // does — so screens must go through the wrapper.
  //
  // Re-importing the real sheet is the obvious thing to do while editing a
  // screen, and nothing else would notice until someone ran a stale binary.
  const offenders = screenFiles(join(IOS_ROOT, 'app')).filter((file) =>
    /from '@\/components\/PhotoSubmitSheet'/.test(readFileSync(file, 'utf8')),
  );

  assert.deepEqual(
    offenders.map((f) => f.slice(IOS_ROOT.length + 1)),
    [],
    'screens must import PhotoSubmitSheetLazy, not PhotoSubmitSheet',
  );
});
