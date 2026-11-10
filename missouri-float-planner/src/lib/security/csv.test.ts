import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvCell, csvRow } from './csv';

describe('csv cells', () => {
  it('neutralizes text that a spreadsheet would run as a formula', () => {
    assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
    assert.equal(csvCell('+1+1'), "'+1+1");
    assert.equal(csvCell('-2+3'), "'-2+3");
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvCell('\t=1'), "'\t=1");
  });

  it('leaves real numbers, including negative coordinates, as numbers', () => {
    assert.equal(csvCell(-91.5), '-91.5');
    assert.equal(csvCell(0), '0');
    assert.equal(csvCell(Number.NaN), '');
  });

  it('quotes commas, quotes, and both kinds of line break', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
    assert.equal(csvCell('one\rtwo'), '"one\rtwo"');
  });

  it('renders empties, booleans and objects', () => {
    assert.equal(csvRow([null, undefined, true, { a: 1 }, 'plain']), ',,true,"{""a"":1}",plain');
  });
});
