import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, createAdminToken } from '../admin-auth';
import { START_HERE, VISUAL_GUIDES } from './visual-guides';
import { GET } from '../../app/admin/visuals/[filename]/route';

async function withSecret(run: () => Promise<void>) {
  const original = process.env.ADMIN_API_SECRET;
  process.env.ADMIN_API_SECRET = 'visual-guides-test-secret';
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = original;
  }
}

function loadGuide(filename: string, token?: string) {
  const request = new NextRequest('https://eddy.guide/admin/visuals/watershed.html', {
    headers: token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {},
  });
  return GET(request, { params: Promise.resolve({ filename }) });
}

test('direct guide links require a valid, unexpired admin session', async () => {
  await withSecret(async () => {
    const expiredAt = Date.now() - 1000;
    const expiredSignature = createHmac('sha256', process.env.ADMIN_API_SECRET!)
      .update(`admin:${expiredAt}`).digest('hex');
    for (const token of [undefined, 'forged-session', `${expiredAt}.${expiredSignature}`]) {
      const response = await loadGuide('watershed.html', token);
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), 'https://eddy.guide/admin/visuals');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(await response.text(), '');
    }
  });
});

test('every catalogued guide is private HTML with working collection links', async () => {
  await withSecret(async () => {
    const token = createAdminToken();
    const filenames = VISUAL_GUIDES.map((guide) => guide.file);
    const diskFiles = (await readdir('content/admin-visuals')).filter((file) => file.endsWith('.html'));
    assert.deepEqual(diskFiles.sort(), [...filenames].sort());
    assert.equal(new Set(filenames).size, filenames.length);
    for (const filename of filenames) {
      const response = await loadGuide(filename, token);
      assert.equal(response.status, 200, filename);
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      const html = await response.text();
      assert.ok(html.includes('href="/admin/visuals"'), `${filename}: collection link`);
      assert.ok(html.includes('href="/admin"'), `${filename}: dashboard link`);
      for (const match of html.matchAll(/(?:href|value)="([a-z-]+\.html)"/g)) {
        assert.ok(filenames.includes(match[1] as typeof filenames[number]), `${filename}: ${match[1]}`);
      }
    }
  });
});

test('the guide handler rejects unknown files and traversal with a valid session', async () => {
  await withSecret(async () => {
    const token = createAdminToken();
    for (const filename of ['missing.html', '../watershed.html', '../../../.env.local', '%2e%2e%2fwatershed.html', '/etc/passwd']) {
      const response = await loadGuide(filename, token);
      assert.equal(response.status, 404, filename);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(await response.text(), 'Guide not found');
    }
  });
});

test('each gallery card matches the guide it opens and leads with a question', async () => {
  assert.ok(VISUAL_GUIDES.some((guide) => guide.file === START_HERE));
  for (const guide of VISUAL_GUIDES) {
    const html = await readFile(`content/admin-visuals/${guide.file}`, 'utf8');
    const heading = html.match(/<h1[^>]*>([^<]*)</)?.[1].trim();
    assert.equal(guide.title, heading, `${guide.file}: card title must match the guide's <h1>`);
    assert.match(guide.question, /\?$/, `${guide.file}: card heading is a question`);
    assert.ok(guide.tryIt.length <= 70, `${guide.file}: keep "Try it" to one short line`);
  }
});
