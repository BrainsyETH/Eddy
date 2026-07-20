// Guards the F12 audit fix: JSON-LD serialization must never be able to
// terminate its <script> element, while staying valid JSON for parsers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonLdString } from './json-ld';

test('a </script> payload cannot terminate the script element', () => {
  const payload = { name: 'Evil </script><img src=x onerror=alert(1)>' };
  const out = jsonLdString(payload);
  assert.ok(!out.includes('<'), 'serialized JSON-LD must contain no raw "<"');
  assert.deepEqual(JSON.parse(out), payload, 'escaping must be lossless for JSON parsers');
});

test('normal structured data round-trips unchanged', () => {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }],
  };
  assert.deepEqual(JSON.parse(jsonLdString(data)), data);
});
