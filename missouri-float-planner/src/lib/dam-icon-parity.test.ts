import { existsSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The website and the app draw the same Eddy marks — the dam card's stats, the
 * hazards list, the access-point sections — so a gauge must look the same on
 * both. eddy-ios/scripts/build-eddy-icons.py writes both copies from
 * design/eddy-emoji; this fails when one side was hand-edited or re-exported
 * without the other.
 *
 * Pixel equality, not byte equality, for the same reason as the build-route
 * check in floats-discovery.test.ts: a re-encode is fine, a different drawing
 * is not.
 */
const WEB = 'public/icons';
const IOS = '../eddy-ios/assets/eddy';

test('every Eddy icon the website shares with the app is the same drawing', async () => {
  const shared = readdirSync(WEB).filter((file) => file.startsWith('eddy-') && existsSync(`${IOS}/${file}`));
  // The dam card's marks must be among them, or the card silently fell back
  // to art the app does not use.
  for (const required of ['eddy-release.png', 'eddy-water-temperature.png', 'eddy-other-usgs-gauge.png', 'eddy-inflow.png', 'eddy-fishery.png', 'eddy-hazard.png']) {
    assert.ok(shared.includes(required), `${required} is missing from ${WEB}`);
  }
  const pixels = (path: string) => sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const file of shared) {
    const [web, ios] = await Promise.all([pixels(`${WEB}/${file}`), pixels(`${IOS}/${file}`)]);
    assert.deepEqual(web.info, ios.info, `${file} has different dimensions on web and iOS`);
    assert.ok(web.data.equals(ios.data), `${file} differs between web and iOS — re-run build-eddy-icons.py`);
  }
});
