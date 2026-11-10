import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeStem, sniffImage, sniffVideo } from './sniff';

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? Array.from(part, (c) => c.charCodeAt(0)) : part)));

describe('sniffing uploads by content', () => {
  it('recognises the four allowed image formats', () => {
    assert.equal(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext, 'jpg');
    assert.equal(sniffImage(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))?.ext, 'png');
    assert.equal(sniffImage(bytes('GIF89a'))?.ext, 'gif');
    assert.equal(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))?.ext, 'webp');
  });

  it('refuses HTML and SVG whatever type the uploader claimed', () => {
    assert.equal(sniffImage(bytes('<!doctype html><script>alert(1)</script>')), null);
    assert.equal(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="x()">')), null);
    assert.equal(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WAVE')), null);
    assert.equal(sniffImage(new Uint8Array()), null);
  });

  it('recognises mp4, mov and webm video and nothing else', () => {
    assert.equal(sniffVideo(bytes([0, 0, 0, 0x20], 'ftypisom'))?.ext, 'mp4');
    assert.equal(sniffVideo(bytes([0, 0, 0, 0x14], 'ftypqt  '))?.ext, 'mov');
    assert.equal(sniffVideo(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.ext, 'webm');
    assert.equal(sniffVideo(bytes('<html>')), null);
  });

  it('never lets the filename choose the extension or a path', () => {
    assert.equal(safeStem('../../evil.html'), 'evil');
    assert.equal(safeStem('my photo (1).PNG'), 'my_photo_1');
    assert.equal(safeStem('.html'), 'file');
    assert.equal(safeStem('a/b\\c.svg'), 'a_b_c');
  });
});
