import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SHA_40 = /^[a-f0-9]{40}$/;

test('third-party GitHub Actions are pinned to immutable commit SHAs', () => {
  const workflowDirectory = path.resolve(process.cwd(), '../.github/workflows');
  const workflowFiles = readdirSync(workflowDirectory).filter((file) =>
    /\.ya?ml$/.test(file),
  );
  const unpinned: string[] = [];
  let thirdPartyActionCount = 0;

  for (const file of workflowFiles) {
    const contents = readFileSync(path.join(workflowDirectory, file), 'utf8');

    contents.split('\n').forEach((line, index) => {
      const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
      if (!match) return;

      const reference = match[1];
      if (reference.startsWith('./')) return;

      thirdPartyActionCount += 1;
      const separator = reference.lastIndexOf('@');
      const revision = separator >= 0 ? reference.slice(separator + 1) : '';

      if (!SHA_40.test(revision)) {
        unpinned.push(`${file}:${index + 1} (${reference})`);
      }
    });
  }

  assert.ok(thirdPartyActionCount > 0, 'expected at least one third-party action');
  assert.deepEqual(
    unpinned,
    [],
    `unpinned third-party actions:\n${unpinned.join('\n')}`,
  );
});
