// scripts/check-tailwind-tokens.ts
// Guard against Tailwind color classes that reference a palette family/shade
// which doesn't exist in the resolved theme. This is the bug that shipped the
// 404/error pages unstyled (bg-ozark-900, text-bluff-400) and made the map
// controls invisible (bg-river-water) — undefined tokens fail silently at
// runtime, so we catch them at lint time instead.
//
// Scope: only color-bearing utilities with a NUMERIC shade (…-500, …-900/…-950,
// optional /opacity). That keeps the check free of false positives from
// gradient direction utilities (bg-gradient-to-r), keyword colors
// (border-transparent), directional borders (border-t-primary-600), and the
// type scale (text-3xl). It does not catch non-numeric custom shades.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import resolveConfig from 'tailwindcss/resolveConfig';
import config from '../tailwind.config';

const theme = resolveConfig(config).theme as unknown as { colors: Record<string, unknown> };
const colors = theme.colors ?? {};

// Reverse index: palette hex → "family-shade". Lets us spot raw hex that
// duplicates a design token and should use the token / CSS var instead.
// Legacy aliases (river/ozark → primary, bluff → neutral) share hexes with the
// canonical families; skip them so suggestions name the canonical token.
const ALIAS_FAMILIES = new Set(['river', 'ozark', 'bluff']);
const hexToToken = new Map<string, string>();
for (const [family, scale] of Object.entries(colors)) {
  if (ALIAS_FAMILIES.has(family)) continue;
  if (typeof scale === 'string') {
    if (scale.startsWith('#')) hexToToken.set(scale.toLowerCase(), family);
  } else if (scale && typeof scale === 'object') {
    for (const [shade, val] of Object.entries(scale as Record<string, unknown>)) {
      if (typeof val === 'string' && val.startsWith('#')) {
        hexToToken.set(val.toLowerCase(), `${family}-${shade}`);
      }
    }
  }
}

const SRC = join(__dirname, '..', 'src');

// bg|text|border|… , optional directional side (t/r/b/l/x/y/s/e/tl/…),
// then family-shade with a numeric shade and optional /opacity.
const TOKEN_RE =
  /\b(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|placeholder|outline|decoration|shadow|caret|accent)(?:-(?:t|r|b|l|x|y|s|e|tl|tr|bl|br))?-([a-z]+)-(\d{2,3})(?:\/\d{1,3})?\b/g;

function shadeExists(family: string, shade: string): boolean {
  const scale = colors[family];
  if (scale == null) return false;
  if (typeof scale === 'string') return false; // single-value color has no shades
  return Object.prototype.hasOwnProperty.call(scale, shade);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?|mdx)$/.test(entry)) out.push(full);
  }
  return out;
}

const problems: string[] = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const match of Array.from(line.matchAll(TOKEN_RE))) {
      const [token, family, shade] = match;
      if (!shadeExists(family, shade)) {
        problems.push(`${file.replace(SRC, 'src')}:${i + 1}  ${token}  (unknown color token "${family}-${shade}")`);
      }
    }
  });
}

// ── Advisory: raw inline-style hex for a light "Field Notebook" card token ──
// Non-failing. The light card surfaces (warm fills, warm borders, teal card
// border) must be CSS vars in components — these are exactly the tokens that
// drifted in as raw #F4EFE7 / #A49C8E before this pass. Dark map chrome and
// data-viz colors use raw hex on purpose and are NOT flagged. Style-property
// context only. Add "raw-hex-ok" on a line to keep a raw value intentionally.
const CARD_TOKENS = new Set([
  'secondary-50', 'secondary-100', 'secondary-200', 'neutral-300', 'neutral-400', 'primary-700',
]);
const HEX_RE = /#[0-9a-fA-F]{6}\b/g;
const STYLE_CTX =
  /\b(background|backgroundColor|color|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|boxShadow|fill|stroke|outline)\b/;
const advisories: string[] = [];
const MOSW = join(SRC, 'components', 'mo-surface-water');
// MOMap renders MapLibre/canvas layers whose paint properties require literal
// hex (they can't read CSS vars), so the map renderer is out of scope here.
for (const file of walk(MOSW).filter((f) => !f.endsWith('MOMap.tsx'))) {
  const fileLines = readFileSync(file, 'utf8').split('\n');
  fileLines.forEach((line, i) => {
    if (line.includes('raw-hex-ok') || !STYLE_CTX.test(line)) return;
    for (const m of Array.from(line.matchAll(HEX_RE))) {
      const token = hexToToken.get(m[0].toLowerCase());
      if (token && CARD_TOKENS.has(token)) {
        advisories.push(`${file.replace(SRC, 'src')}:${i + 1}  ${m[0]}  → token "${token}" (var(--color-${token}))`);
      }
    }
  });
}
if (advisories.length > 0) {
  console.warn(`\n⚠ ${advisories.length} inline-style hex value(s) duplicate a design token (advisory, not failing):`);
  console.warn(advisories.slice(0, 40).join('\n'));
  if (advisories.length > 40) console.warn(`… and ${advisories.length - 40} more`);
  console.warn('Use the CSS var / Tailwind class, or add "raw-hex-ok" on the line if intentional.\n');
}

if (problems.length > 0) {
  console.error(`\n✖ Found ${problems.length} undefined Tailwind color token(s):\n`);
  console.error(problems.join('\n'));
  console.error('\nDefine the family/shade in tailwind.config.ts or use an existing token.\n');
  process.exit(1);
}

console.log('✓ No undefined Tailwind color tokens found.');

// ── THEME drift guard ──────────────────────────────────────────────────────
// The map module (src/lib/usgs/mo-statewide-data.ts) mirrors palette hexes as
// literals because its WebGL/canvas layers can't read CSS vars. Assert those
// mirrors still equal the Tailwind source so the single design system and the
// map module can't silently diverge. (Values are parsed from source so the
// check stays free of that module's runtime imports.)
const THEME_MIRRORS: Record<string, string> = {
  cardBorder: 'primary-700', cardShadow: 'neutral-400',
  ink: 'neutral-900', inkDim: 'neutral-600',
  live: 'accent-500', liveDim: 'accent-600',
  primary: 'primary-500', primaryDark: 'primary-800',
  trail: 'support-500', tan: 'secondary-500',
  basinFill: 'primary-800', stateFill: 'secondary-100',
  stateGrain: 'secondary-200', stateOutline: 'primary-700', mapBg: 'primary-900',
};
const tokenHex = (name: string): string | undefined => {
  const [family, shade] = name.split('-');
  const scale = colors[family];
  if (typeof scale === 'string') return scale;
  if (scale && typeof scale === 'object') return (scale as Record<string, string>)[shade];
  return undefined;
};
const themeSrc = readFileSync(join(SRC, 'lib', 'usgs', 'mo-statewide-data.ts'), 'utf8');
const themeProblems: string[] = [];
for (const [field, token] of Object.entries(THEME_MIRRORS)) {
  const m = themeSrc.match(new RegExp(`\\b${field}:\\s*'(#[0-9A-Fa-f]{6})'`));
  if (!m) continue; // field absent or non-literal — nothing to compare
  const want = tokenHex(token);
  if (want && m[1].toLowerCase() !== want.toLowerCase()) {
    themeProblems.push(`  THEME.${field} = ${m[1]} but token ${token} = ${want}`);
  }
}
if (themeProblems.length > 0) {
  console.error(`\n✖ THEME drifted from the Tailwind palette (update one side to match):\n${themeProblems.join('\n')}\n`);
  process.exit(1);
}
console.log('✓ THEME mirror in sync with the palette.');
