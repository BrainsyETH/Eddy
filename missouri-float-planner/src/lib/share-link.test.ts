import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { shareOrCopy, type ShareEnvironment } from './share-link';

const LINK = { url: 'https://eddy.guide/rivers/missouri/current', title: 'Current River' };

function environment(overrides: Partial<ShareEnvironment> = {}) {
  const calls: string[] = [];
  const env: ShareEnvironment = {
    coarsePointer: true,
    share: async data => { calls.push(`share:${data.title ?? ''}:${data.url}`); },
    writeText: async text => { calls.push(`copy:${text}`); },
    ...overrides,
  };
  return { env, calls };
}
const rejectWith = (name: string) => async () => { throw Object.assign(new Error(name), { name }); };

test('a touch device shares the title and link through the native sheet, and copies nothing', async () => {
  const { env, calls } = environment();
  assert.equal(await shareOrCopy(LINK, env), 'shared');
  assert.deepEqual(calls, ['share:Current River:https://eddy.guide/rivers/missouri/current']);
});

test('dismissing the share sheet copies nothing', async () => {
  const { env, calls } = environment({ share: rejectWith('AbortError') });
  assert.equal(await shareOrCopy(LINK, env), 'cancelled');
  assert.deepEqual(calls, [], 'the clipboard is untouched');
});

test('a sheet that fails for any other reason still hands over the link', async () => {
  const { env, calls } = environment({ share: rejectWith('NotAllowedError') });
  assert.equal(await shareOrCopy(LINK, env), 'copied');
  assert.deepEqual(calls, ['copy:https://eddy.guide/rivers/missouri/current']);
});

test('a pointer device copies, even where the browser has a share sheet', async () => {
  const { env, calls } = environment({ coarsePointer: false });
  assert.equal(await shareOrCopy(LINK, env), 'copied');
  assert.deepEqual(calls, ['copy:https://eddy.guide/rivers/missouri/current']);
});

test('a blocked or missing clipboard is reported, never silent', async () => {
  const blocked = environment({ coarsePointer: false, writeText: rejectWith('NotAllowedError') });
  assert.equal(await shareOrCopy(LINK, blocked.env), 'failed');
  const missing = environment({ coarsePointer: false, writeText: undefined });
  assert.equal(await shareOrCopy(LINK, missing.env), 'failed');
  const both = environment({ share: rejectWith('DataError'), writeText: rejectWith('NotAllowedError') });
  assert.equal(await shareOrCopy(LINK, both.env), 'failed');
});

test('a second tap while the sheet is open does nothing, and the next share works', async () => {
  let release!: () => void;
  const open = new Promise<void>(resolve => { release = resolve; });
  const { env, calls } = environment({ share: async data => { calls.push(`share:${data.url}`); await open; } });
  const first = shareOrCopy(LINK, env);
  assert.equal(await shareOrCopy(LINK, env), 'cancelled');
  release();
  assert.equal(await first, 'shared');
  assert.equal(calls.length, 1, 'no copy behind the open sheet');
  assert.equal(await shareOrCopy(LINK, env), 'shared');
});

test('a link without a title shares only the link', async () => {
  let shared: unknown;
  const { env } = environment({ share: async data => { shared = data; } });
  await shareOrCopy({ url: LINK.url }, env);
  assert.deepEqual(shared, { url: LINK.url });
});

// One implementation, so the cancel rule cannot drift again. Gauge, dam and
// chart shares keep their own flow under ADR 0015.
test('share buttons go through the shared helper instead of calling the browser themselves', async () => {
  const { readdir } = await import('node:fs/promises');
  const own = new Set([
    'src/lib/share-link.ts',
    'src/components/gauge/StationShareButton.tsx',
    'src/components/gauge/ChartShareControls.tsx',
  ]);
  const offenders: string[] = [];
  for (const entry of await readdir('src', { recursive: true })) {
    const file = `src/${entry}`;
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry) || own.has(file) || /^app\/(admin|api)\//.test(entry)) continue;
    if (/navigator\.share\(/.test(await readFile(file, 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('the river and access point buttons share a canonical path, not the address bar', async () => {
  for (const file of ['src/app/rivers/[state]/[slug]/ShareRiverButton.tsx', 'src/components/access-point/AccessPointShareButton.tsx']) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /canonicalShareUrl\(path\)/, file);
    assert.doesNotMatch(source, /window\.location\.href/, file);
  }
});
