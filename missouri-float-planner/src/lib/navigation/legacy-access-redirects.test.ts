// Renamed access-point URLs are public links. Keep their permanent redirects
// in Next's route table so they resolve before page metadata or database reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
const redirectSection = config.slice(config.indexOf('async redirects()'), config.indexOf('async headers()'));
const configured = [...redirectSection.matchAll(
  /\{\s*source:\s*'([^']+)',\s*destination:\s*'([^']+)',\s*permanent:\s*(true|false),?\s*\}/g,
)].map(([, source, destination, permanent]) => ({ source, destination, permanent: permanent === 'true' }));

test('renamed Buffalo access links permanently redirect to approved production slugs', () => {
  for (const [legacy, canonical] of [
    ['hasty-launch', 'hasty'],
    ['maumee-north', 'north-maumee'],
  ]) {
    const source = `/rivers/arkansas/buffalo/access/${legacy}`;
    const destination = `/rivers/arkansas/buffalo/access/${canonical}`;
    assert.deepEqual(configured.filter((entry) => entry.source === source), [
      { source, destination, permanent: true },
    ], `Missing or incorrect permanent redirect for ${legacy}`);
  }
});

test('do not guess a destination for unverified Buffalo access URLs', () => {
  for (const slug of ['ozark-campground', 'mt-hersey']) {
    assert.ok(!configured.some((entry) => entry.source === `/rivers/arkansas/buffalo/access/${slug}`));
  }
});
