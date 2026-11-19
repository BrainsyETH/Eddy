// The dam and lake pages draw these photos as a wide header. Two mistakes are
// invisible in review and obvious on the page: an app-sized thumbnail stretched
// across it, and a centred crop that shows water where the dam should be.

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import credits from '../../../shared/place-photo-credits.json';
import { USACE_DAMS } from '../flow-providers/usace-registry';
import { damPhoto, lakePhoto } from './photography';
import { publishedLakes } from './public-pages';
import { damHeaderPhoto } from '../../../../eddy-ios/src/lib/damHeader';
import { lakeHeaderPhoto } from '../../../../eddy-ios/src/lib/lakeHeader';
import { imageUrl } from '../../../../eddy-ios/src/lib/imageUrl';

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

test('iOS dam headers keep the web selection, crop and attribution together', () => {
  for (const id of damIds) {
    const web = damPhoto(id);
    const native = damHeaderPhoto(id);
    if (!web) {
      assert.equal(native, null, `${id}: no substitute photograph`);
      continue;
    }
    assert.equal(native?.url, `https://eddy.guide${web.src}`);
    assert.equal(native?.focus, web.focus);
    assert.equal(native?.credit?.text, credits[id as keyof typeof credits].credit);
    assert.equal(native?.credit?.url, `https://eddy.guide/photo-credits#${id}`);
    const resized = new URL(imageUrl(native!.url, 1200));
    assert.equal(resized.searchParams.get('url'), web.src);
    assert.equal(resized.searchParams.get('w'), '1200');
  }
  for (const id of ['unknown-dam', 'lake-table-rock', 'launch-table-rock-moonshine-beach', 'constructor', '__proto__']) {
    assert.equal(damHeaderPhoto(id), null);
  }
});

test('the iOS lake screen opens on the web lake page\'s own scenery, credited, for every published lake', () => {
  for (const lake of publishedLakes()) {
    const web = lakePhoto(lake.slug);
    const native = lakeHeaderPhoto(lake.slug);
    assert.ok(web, `${lake.slug}: a published lake needs its own photograph`);
    assert.equal(native?.url, `https://eddy.guide${web.src}`);
    assert.equal(native?.credit?.text, credits[`lake-${lake.slug}` as keyof typeof credits].credit);
    assert.equal(native?.credit?.url, `https://eddy.guide/photo-credits#lake-${lake.slug}`);
  }
  // A lake screen never borrows the dam's photograph, and a stray key is not a lake.
  for (const slug of ['nowhere', 'swl-table-rock-dam', 'constructor', '__proto__']) assert.equal(lakeHeaderPhoto(slug), null);
});
