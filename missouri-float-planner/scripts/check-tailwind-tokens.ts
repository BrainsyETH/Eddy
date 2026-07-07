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

if (problems.length > 0) {
  console.error(`\n✖ Found ${problems.length} undefined Tailwind color token(s):\n`);
  console.error(problems.join('\n'));
  console.error('\nDefine the family/shade in tailwind.config.ts or use an existing token.\n');
  process.exit(1);
}

console.log('✓ No undefined Tailwind color tokens found.');
