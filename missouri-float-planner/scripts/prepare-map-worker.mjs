import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MapLibre 6's ESM worker must be served explicitly in a bundled application.
 * 6.9 also imports a sibling shared module: emitting only the worker as a
 * hashed asset breaks that relative import. Keep the installed pair together
 * at a versioned same-origin URL, with no CDN dependency or CSP relaxation.
 * Called by Next config so dev, webpack and Turbopack builds all prepare it.
 */
export function prepareMapWorker(publicDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public')) {
  const require = createRequire(import.meta.url);
  const packageDir = dirname(require.resolve('maplibre-gl/package.json'));
  const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const destination = join(publicDir, 'maplibre', version);
  mkdirSync(destination, { recursive: true });
  for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
    copyFileSync(join(packageDir, 'dist', file), join(destination, file));
  }
  copyFileSync(join(packageDir, 'LICENSE.txt'), join(destination, 'LICENSE.txt'));
  return destination;
}
