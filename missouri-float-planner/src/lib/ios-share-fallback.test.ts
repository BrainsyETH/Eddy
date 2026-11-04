import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real hook with native file/share boundaries stubbed. Native SVG
// rendering itself remains a device gate, not something this harness simulates.
const source = ts.transpileModule(readFileSync('../eddy-ios/src/hooks/useShareImage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function scenario(options: { status?: number; timeout?: boolean; cached?: boolean }) {
  const writes: { bytes: unknown; encoding?: string }[] = [];
  const shares: { url: string; message: string }[] = [];
  const alerts: string[] = [];
  let deleted = 0, requested = 0, fallback = 0, saved = 0;
  class File {
    exists = false;
    uri = 'file://temporary-share.png';
    write(bytes: unknown, config?: { encoding: string }) { writes.push({ bytes, encoding: config?.encoding }); this.exists = true; }
    delete() { deleted++; this.exists = false; }
  }
  const dependencies: Record<string, unknown> = {
    react: { useState: (value: unknown) => [value, () => {}], useRef: (current: unknown) => ({ current }), useEffect: (effect: () => unknown) => { effect(); } },
    'react-native': { Alert: { alert: (_title: string, message: string) => { alerts.push(message); } },
      Share: { share: async (payload: { url: string; message: string }) => { shares.push(payload); } } },
    'expo-file-system': { File, Paths: { cache: 'cache' } },
    '@/lib/share': { webUrl: (path: string) => `https://eddy.guide${path}` },
    '@/lib/shareImageCache': {
      shareImageRevision: () => 1,
      readShareImage: () => options.cached ? { file: { bytes: async () => new Uint8Array([9]) }, link: '/rivers/mo/current' } : null,
      cacheShareImage: () => { saved++; },
    },
  };
  type Request = { imagePath: string; fileName: string; title: string; cache: boolean; prepareTimeoutMs: number;
    fallbackImage: () => Promise<string>; linkPath: () => string; failureMessage: (status: number) => string };
  const exports: { useShareImage?: () => { shareImage: (request: Request) => Promise<void> } } = {};
  runInNewContext(source, { exports, AbortController, Uint8Array, setTimeout, clearTimeout,
    fetch: async (_url: string, { signal }: { signal: AbortSignal }) => {
      requested++;
      if (options.timeout) return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true }));
      return new Response(new Uint8Array([1, 2, 3]), { status: options.status ?? 200, headers: { 'content-type': 'image/png' } });
    },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  await exports.useShareImage!().shareImage({ imagePath: '/api/share/float/image?state=example', fileName: 'eddy-float-2026-11-04',
    title: 'Current River float', cache: true, prepareTimeoutMs: options.timeout ? 5 : 1000,
    fallbackImage: async () => { fallback++; return 'cG5n'; }, linkPath: () => '/rivers/mo/current',
    failureMessage: status => `Server rejected: ${status}`,
  });
  return { writes, shares, alerts, deleted, requested, fallback, saved };
}

test('successful float images are cached and the temporary share file is cleaned up', async () => {
  const result = await scenario({});
  assert.equal(result.saved, 1);
  assert.equal(result.fallback, 0);
  assert.equal(result.deleted, 1);
  assert.match(result.shares[0].message, /https:\/\/eddy.guide\/rivers\/mo\/current/);
});

test('a cached successful image is shared without a request or deleting the cache', async () => {
  const result = await scenario({ cached: true });
  assert.equal(result.requested, 0);
  assert.equal(result.fallback, 0);
  assert.equal(result.deleted, 1, 'only the temporary copy was deleted');
  assert.equal(result.shares.length, 1);
});

test('server failure, rate limiting and a stalled request use a local image without caching it', async () => {
  for (const options of [{ status: 503 }, { status: 429 }, { timeout: true }]) {
    const result = await scenario(options);
    assert.equal(result.fallback, 1);
    assert.equal(result.saved, 0);
    assert.equal(result.alerts.length, 0);
    assert.equal(result.writes[0].encoding, 'base64');
    assert.equal(result.shares[0].message, 'Current River float');
    assert.equal(result.deleted, 1);
  }
});

test('removed places and rejected shares keep their specific errors', async () => {
  for (const status of [400, 401, 402, 403, 404, 422]) {
    const result = await scenario({ status });
    assert.equal(result.fallback, 0);
    assert.equal(result.shares.length, 0);
    assert.deepEqual(result.alerts, [`Server rejected: ${status}`]);
  }
});
