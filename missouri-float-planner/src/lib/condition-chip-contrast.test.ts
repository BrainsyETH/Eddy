import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONDITION_SYSTEM, type ConditionCode } from '@shared/condition-system';
import {
  darkPalette,
  lightPalette,
  neutral,
  primary,
  secondary,
  type Palette,
} from '../../../eddy-ios/src/theme/palette';

// ── Why this test exists ────────────────────────────────────────────────────
// Every condition chip in the iOS app was drawn with the canonical `ink` — an
// 800-level dark chosen for white — regardless of scheme. Over the phone's
// dark cards the tint composites to near black and the ink sat on it at 1.1 to
// 1.6:1. "Flood - Do Not Float" was unreadable at 5am, and nothing caught it
// because nothing composited the tint over the surfaces it is actually drawn on.
//
// This does. For every code, for every surface a chip sits on in each scheme,
// the scheme's ink over the composited tint must clear WCAG AA (4.5:1). It also
// pins the two text roles that carry 12pt lines, and the filled star's 3:1.

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbaToRgbAlpha(rgba: string): { rgb: Rgb; alpha: number } {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  assert.ok(m, `not an rgba() string: ${rgba}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] == null ? 1 : Number(m[4]) };
}

/** Source-over: `fg` at `alpha` on an opaque `bg`. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const CODES = Object.keys(CONDITION_SYSTEM) as ConditionCode[];

/** The opaque surfaces a chip is drawn on, per scheme. */
function chipSurfaces(palette: Palette): Record<string, Rgb> {
  return {
    card: hexToRgb(palette.card),
    cardRaised: hexToRgb(palette.cardRaised),
    bg: hexToRgb(palette.bg),
  };
}

test('every chip ink clears AA over its tint on every light surface', () => {
  for (const code of CODES) {
    const def = CONDITION_SYSTEM[code];
    const tint = rgbaToRgbAlpha(def.bg);
    for (const [name, surface] of Object.entries(chipSurfaces(lightPalette))) {
      const under = composite(tint.rgb, tint.alpha, surface);
      const ratio = contrast(hexToRgb(def.ink), under);
      assert.ok(ratio >= 4.5, `${code} ink on light ${name}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test('every chip darkInk clears AA over its tint on every dark surface', () => {
  for (const code of CODES) {
    const def = CONDITION_SYSTEM[code];
    const tint = rgbaToRgbAlpha(def.bg);
    for (const [name, surface] of Object.entries(chipSurfaces(darkPalette))) {
      const under = composite(tint.rgb, tint.alpha, surface);
      const ratio = contrast(hexToRgb(def.darkInk), under);
      assert.ok(ratio >= 4.5, `${code} darkInk on dark ${name}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the light ink genuinely fails on dark, which is why darkInk exists', () => {
  // Guards the premise: if the dark card ever lightens enough for the 800-level
  // ink to pass, the two-ink design can be revisited rather than carried.
  const def = CONDITION_SYSTEM.dangerous;
  const tint = rgbaToRgbAlpha(def.bg);
  const under = composite(tint.rgb, tint.alpha, hexToRgb(darkPalette.card));
  assert.ok(contrast(hexToRgb(def.ink), under) < 3);
});

test('no iOS file draws a tinted chip with the scheme-blind ink', () => {
  // conditionInk() is the light-only value. Anything on a conditionBg tint must
  // go through conditionChipInk(code, isDark). Allowed: conditions.ts itself,
  // where both are defined.
  const APP = join(process.cwd(), '../eddy-ios');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        if (rel.endsWith('src/theme/conditions.ts')) continue;
        const source = readFileSync(join(APP, rel), 'utf8');
        if (/\bconditionInk\(/.test(source)) offenders.push(rel);
      }
    }
  };
  walk('app');
  walk('src');
  assert.deepEqual(offenders, [], `use conditionChipInk(code, isDark) instead of conditionInk in: ${offenders.join(', ')}`);
});

test('the two text roles that carry 12pt lines clear AA on their scheme', () => {
  for (const palette of [lightPalette, darkPalette]) {
    for (const role of ['textMuted', 'textSubtle'] as const) {
      for (const surface of ['card', 'cardRaised', 'bg'] as const) {
        const ratio = contrast(hexToRgb(palette[role]), hexToRgb(palette[surface]));
        assert.ok(ratio >= 4.5, `${palette.scheme} ${role} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('the filled star clears 3:1 and warm chip text clears 4.5:1', () => {
  for (const palette of [lightPalette, darkPalette]) {
    for (const surface of ['card', 'cardRaised', 'bg'] as const) {
      const star = contrast(hexToRgb(palette.favorite), hexToRgb(palette[surface]));
      assert.ok(star >= 3, `${palette.scheme} favorite on ${surface}: ${star.toFixed(2)}:1`);
      const ink = contrast(hexToRgb(palette.warmInk), hexToRgb(palette[surface]));
      assert.ok(ink >= 4.5, `${palette.scheme} warmInk on ${surface}: ${ink.toFixed(2)}:1`);
    }
  }
});

test('the roles come from the documented scales, not invented hex', () => {
  const documented = new Set<string>([
    ...Object.values(primary),
    ...Object.values(secondary),
    ...Object.values(neutral),
  ]);
  for (const palette of [lightPalette, darkPalette]) {
    for (const role of ['textMuted', 'textSubtle', 'favorite', 'warmInk'] as const) {
      assert.ok(documented.has(palette[role]), `${palette.scheme} ${role} is off-scale: ${palette[role]}`);
    }
  }
});
