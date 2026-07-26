import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The Expo app has no test runner, so its structural invariants are checked
// here — the same arrangement as api-cache-headers.test.ts.
const APP = join(process.cwd(), '../eddy-ios');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/** Every .tsx under app/ and src/, which is where StyleSheets live. */
function componentFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.tsx')) out.push(rel);
    }
  };
  walk('app');
  walk('src');
  return out;
}

/** The body of a `StyleSheet.create({ … })` call, if the file has one. */
function styleSheetBody(source: string): string | null {
  const start = source.indexOf('StyleSheet.create({');
  if (start === -1) return null;
  return source.slice(start);
}

const COLOUR_KEYS =
  /\b(backgroundColor|borderColor|borderTopColor|borderBottomColor|shadowColor|tintColor|color)\s*:/;

test('no StyleSheet hardcodes a colour', () => {
  // THE invariant that makes light/dark work. StyleSheet.create runs ONCE at
  // module import, so a colour written into it is frozen at whichever scheme the
  // app launched with and will not change when the system flips. Colour must be
  // applied inline from useTheme() instead.
  const offenders: string[] = [];
  for (const file of componentFiles()) {
    const body = styleSheetBody(read(file));
    if (!body) continue;
    for (const [i, line] of body.split('\n').entries()) {
      if (COLOUR_KEYS.test(line)) offenders.push(`${file} (+${i}): ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `colour frozen in a StyleSheet:\n${offenders.join('\n')}`);
});

test('screens read colour from the theme rather than a constant', () => {
  // The old flat COLORS export was the thing that made dual-theme impossible.
  // If it comes back, this fails.
  for (const file of componentFiles()) {
    const src = read(file);
    assert.ok(
      !/\bCOLORS\b/.test(src),
      `${file} references a frozen COLORS constant; use useTheme()`,
    );
  }
});

test('both palettes define every semantic role', () => {
  // A missing key on one palette is `undefined` at runtime, which React Native
  // renders as a transparent or default colour rather than throwing — so it
  // shows up as an invisible label on one scheme only.
  const src = read('src/theme/palette.ts');
  const roles = [...src.matchAll(/^\s{2}(\w+):/gm)]
    .map((m) => m[1])
    .filter((k) => !/^\d+$/.test(k));

  const paletteKeys = (name: string) => {
    const start = src.indexOf(`export const ${name}: Palette = {`);
    assert.ok(start !== -1, `${name} not found`);
    const body = src.slice(start, src.indexOf('};', start));
    return new Set([...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  };

  const light = paletteKeys('lightPalette');
  const dark = paletteKeys('darkPalette');
  const interfaceKeys = roles.filter((r) => dark.has(r) || light.has(r));

  for (const key of interfaceKeys) {
    assert.ok(light.has(key), `lightPalette is missing "${key}"`);
    assert.ok(dark.has(key), `darkPalette is missing "${key}"`);
  }
  assert.ok(interfaceKeys.length > 10, 'expected a full set of semantic roles');
});

test('fonts are imported per weight, not from the package root', () => {
  // Each @expo-google-fonts package's index re-exports every weight it ships,
  // and Metro bundles whatever is reachable. Importing the root put ~8 MB of
  // TTFs in the export for the eight faces actually used; per-weight subpaths
  // cut the asset payload to 5 MB.
  const layout = read('app/_layout.tsx');
  const rootImports = layout.match(/from '@expo-google-fonts\/[a-z-]+'/g) ?? [];
  assert.deepEqual(
    rootImports,
    [],
    `import from the weight subpath instead: ${rootImports.join(', ')}`,
  );
});

test('condition colours are never redefined in the app', () => {
  // shared/condition-system.ts says outright: "Do not hardcode condition hex
  // anywhere else; derive from CONDITION_SYSTEM." An earlier version of this app
  // ignored that and immediately drifted (#DC2626 vs the canonical #ef4444), so
  // the app showed different colours than the website for the same river.
  const canonical = ['#ef4444', '#10b981', '#84cc16', '#f97316', '#eab308', '#78716c'];
  for (const file of componentFiles()) {
    const src = read(file);
    for (const hex of canonical) {
      assert.ok(
        !src.toLowerCase().includes(hex),
        `${file} hardcodes the condition colour ${hex}; use conditionColor()`,
      );
    }
  }
});
