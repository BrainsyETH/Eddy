// The dam and lake pages draw these photos as a wide header. Two mistakes are
// invisible in review and obvious on the page: an app-sized thumbnail stretched
// across it, and a centred crop that shows water where the dam should be.

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import credits from '../../../public/lakes/credits.json';
import { USACE_DAMS } from '../flow-providers/usace-registry';
import { damPhoto } from './photography';

const DIR = 'public/lakes';
const records = Object.entries(credits as Record<string, { asset: string; changes: string; focus?: string }>);
const damIds = new Set(Object.values(USACE_DAMS).map((dam) => dam.id));

test('every credited photo exists, and every photo in the folder is credited', () => {
  for (const [id, photo] of records) assert.ok(existsSync(`${DIR}/${photo.asset}`), `${id}: ${photo.asset} is missing`);
  const credited = new Set(records.map(([, photo]) => photo.asset));
  for (const file of readdirSync(DIR)) if (!file.endsWith('.json')) assert.ok(credited.has(file), `${file} has no credit record`);
});

test('records are keyed by a registry dam, a lake or a launch', () => {
  for (const [id] of records) assert.ok(damIds.has(id) || /^(lake|launch)-/.test(id), `${id} is not a known key`);
});

test('dam header photos are large enough for the header and say where to crop', async () => {
  for (const [id, photo] of records.filter(([key]) => damIds.has(key))) {
    assert.match(photo.focus ?? '', /^\d{1,3}% \d{1,3}%$/, `${id} needs a focus for the wide header crop`);
    assert.equal(damPhoto(id)?.focus, photo.focus);
    const { width = 0 } = await sharp(`${DIR}/${photo.asset}`).metadata();
    assert.ok(width >= 1024, `${id} is ${width}px wide: an app thumbnail, not a header photo`);
  }
});

test('the credits page supplies the full stop after "changes"', () => {
  for (const [id, photo] of records) assert.ok(!photo.changes.endsWith('.'), `${id}: remove the trailing full stop`);
});
