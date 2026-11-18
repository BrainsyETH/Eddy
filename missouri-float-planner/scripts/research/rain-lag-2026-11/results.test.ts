import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { analyze, summary, type Results } from './analyze';
import { REASONS } from './lag';

const read = (...path: string[]) => readFileSync(join(__dirname, ...path));
const recorded = JSON.parse(read('results', 'results.json').toString('utf8')) as Results;

test('the committed series are the ones the study read', () => {
  const sources = JSON.parse(read('data', 'sources.json').toString('utf8')) as { files: Record<string, string> };
  for (const [file, sha256] of Object.entries(sources.files)) assert.equal(createHash('sha256').update(read('data', file)).digest('hex'), sha256, file);
});

test('running the locked rules on the committed series reproduces the recorded results', () => {
  const { results, stormRows } = analyze(__dirname);
  assert.deepEqual(JSON.parse(JSON.stringify(results)), recorded);
  assert.equal(`${stormRows.join('\n')}\n`, read('results', 'storms.csv').toString('utf8'));
  assert.equal(summary(results), read('results', 'summary.md').toString('utf8'));
});

test('every gauge in scope ends as a range or one named reason', () => {
  const protocol = JSON.parse(read('protocol.json').toString('utf8'));
  const { basins } = JSON.parse(read('data', 'basins.json').toString('utf8')) as { basins: { site: string }[] };
  assert.deepEqual(recorded.gauges.map(gauge => gauge.site), basins.map(basin => basin.site));
  for (const gauge of recorded.gauges) {
    if (gauge.result === 'range') {
      assert.equal(gauge.reason, null, gauge.site);
      assert.ok(gauge.verdict?.publish && gauge.verdict.failed.length === 0, gauge.site);
    } else {
      assert.ok(gauge.reason && REASONS.includes(gauge.reason), gauge.site);
      assert.equal(gauge.verdict?.publish ?? null, null, gauge.site);
    }
  }
  assert.deepEqual(recorded.notStudied.map(row => row.site), protocol.scope.not_studied.sites);
  assert.equal(recorded.totals.ranges + Object.values(recorded.totals.noRange).reduce((total, count) => total + count, 0), recorded.gauges.length);
});
