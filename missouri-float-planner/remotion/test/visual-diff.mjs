// test/visual-diff.mjs
//
// Visual-regression gate for the social compositions. Compares freshly rendered
// stills (default /tmp/stills) against committed baselines (test/baselines/) with
// a small anti-aliasing tolerance; fails the build if any composition drifts
// beyond the threshold and writes diff PNGs for review.
//
// The brand lives in these frames — a token/layout change that *shifts* a
// composition would otherwise sail through CI (which only renders, never checks).
// Fonts are bundled (@font-face from public/fonts) and Remotion pins the headless
// shell, so renders are deterministic enough across runners for a tight tolerance.
//
// Usage:
//   node test/visual-diff.mjs                 # diff stills vs baselines (CI gate)
//   node test/visual-diff.mjs --update        # overwrite baselines from stills
//   node test/visual-diff.mjs --stills <dir> --baselines <dir> --out <dir>
// Env equivalents: STILLS_DIR, BASELINES_DIR, DIFF_DIR.
//
// A missing baseline for a rendered comp is a soft skip (so a new composition or
// first run doesn't hard-fail); create/refresh baselines with `--update` (or the
// remotion-check "update_baselines" workflow_dispatch, which renders in the CI
// environment and commits canonical baselines).

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const UPDATE = process.argv.includes('--update');
const STILLS = arg('stills', process.env.STILLS_DIR || '/tmp/stills');
const BASELINES = arg('baselines', process.env.BASELINES_DIR || 'test/baselines');
const DIFF_OUT = arg('out', process.env.DIFF_DIR || '/tmp/visual-diffs');

// pixelmatch per-pixel sensitivity (0 strict … 1 loose). A comp fails when the
// share of differing pixels exceeds MAX_RATIO — generous enough to absorb
// sub-pixel AA, tight enough to catch real layout/color shifts (which move
// thousands of pixels).
const PIXEL_THRESHOLD = 0.1;
const MAX_RATIO = 0.002; // 0.2% of pixels

if (!existsSync(STILLS)) {
  console.error(`✗ stills dir not found: ${STILLS}`);
  process.exit(1);
}

const stills = readdirSync(STILLS)
  .filter((f) => f.endsWith('.png'))
  .sort();

if (stills.length === 0) {
  console.error(`✗ no stills (*.png) in ${STILLS}`);
  process.exit(1);
}

if (UPDATE) {
  mkdirSync(BASELINES, { recursive: true });
  for (const file of stills) {
    copyFileSync(join(STILLS, file), join(BASELINES, file));
    console.log(`updated baseline: ${file}`);
  }
  console.log(`\n${stills.length} baseline(s) updated in ${BASELINES}.`);
  process.exit(0);
}

mkdirSync(DIFF_OUT, { recursive: true });

let failed = 0;
let checked = 0;
let skipped = 0;

for (const file of stills) {
  const comp = basename(file, '.png');
  const baselinePath = join(BASELINES, file);

  if (!existsSync(baselinePath)) {
    console.log(`• ${comp}: no baseline — skipped (run \`npm run test:visual:update\`)`);
    skipped++;
    continue;
  }

  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const current = PNG.sync.read(readFileSync(join(STILLS, file)));

  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.error(
      `✗ ${comp}: dimensions changed ${baseline.width}x${baseline.height} → ${current.width}x${current.height}`,
    );
    failed++;
    continue;
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(baseline.data, current.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
  const ratio = mismatched / (width * height);
  checked++;

  if (ratio > MAX_RATIO) {
    writeFileSync(join(DIFF_OUT, `${comp}.diff.png`), PNG.sync.write(diff));
    console.error(
      `✗ ${comp}: ${mismatched} px differ (${(ratio * 100).toFixed(3)}% > ${(MAX_RATIO * 100).toFixed(1)}%) — diff written to ${DIFF_OUT}/${comp}.diff.png`,
    );
    failed++;
  } else {
    console.log(`✓ ${comp}: ${mismatched} px differ (${(ratio * 100).toFixed(3)}%)`);
  }
}

console.log(`\n${checked} checked, ${skipped} skipped, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
