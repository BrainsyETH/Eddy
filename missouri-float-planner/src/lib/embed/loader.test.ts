import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

// public/embed.js is the script-tag loader: plain ES5, no bundler, shipped
// as-is to third-party pages. It is exercised here against a tiny fake DOM —
// enough to prove it builds the right iframe for each attribute set, sizes
// frames from the widget's resize message, and never mounts twice.

const SOURCE = readFileSync(join(process.cwd(), 'public/embed.js'), 'utf8');

interface FakeEl {
  tag: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: FakeEl[];
  src?: string;
  contentWindow?: object;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  appendChild(child: FakeEl): void;
}

function el(tag: string, attrs: Record<string, string> = {}): FakeEl {
  return {
    tag,
    attrs: { ...attrs },
    style: {},
    children: [],
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    appendChild(child) { this.children.push(child); },
  };
}

function boot(hosts: FakeEl[], scriptSrc = 'https://eddy.guide/embed.js') {
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const iframes: FakeEl[] = [];
  const document = {
    currentScript: { src: scriptSrc },
    readyState: 'complete',
    querySelectorAll(selector: string) {
      return selector.startsWith('iframe') ? iframes : hosts;
    },
    createElement(tag: string) {
      const node = el(tag);
      if (tag === 'iframe') {
        node.contentWindow = {};
        iframes.push(node);
      }
      return node;
    },
    addEventListener() { /* readyState is complete */ },
  };
  const window: Record<string, unknown> = {
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners[type] ??= []).push(fn); },
  };
  runInNewContext(SOURCE, { window, document, URL });
  return { window, listeners, iframes };
}

test('builds the family URLs from data attributes, with every style twin', () => {
  const river = el('div', { 'data-eddy-river': 'current', 'data-size': 'card', 'data-theme': 'auto', 'data-bg': 'transparent', 'data-accent': '2d7889', 'data-days': '30', 'data-partner': 'Pine Valley', 'data-embed': 'emb_0123abcd' });
  const dam = el('div', { 'data-eddy-dam': 'swl-bull-shoals-dam', 'data-size': 'strip' });
  const overview = el('div', { 'data-eddy-rivers': 'current, jacks-fork', 'data-theme': 'dark' });
  const { iframes } = boot([river, dam, overview]);

  assert.equal(iframes.length, 3);
  assert.equal(iframes[0].src, 'https://eddy.guide/embed/river/current?size=card&theme=auto&bg=transparent&accent=%232D7889&days=30&partner=Pine%20Valley&e=emb_0123abcd'.replace('%232D7889', '%232d7889'));
  assert.equal(iframes[1].src, 'https://eddy.guide/embed/dam/swl-bull-shoals-dam?size=strip');
  assert.equal(iframes[2].src, 'https://eddy.guide/embed/rivers?theme=dark&rivers=current%2Cjacks-fork');
  assert.equal(iframes[0].attrs['data-eddy-embed'], '');
  assert.equal(iframes[0].attrs.loading, 'lazy');
  assert.equal(iframes[1].style.borderRadius, '12px');
  assert.equal(river.children.length, 1, 'the iframe is placed inside the host element');
});

test('refuses junk and never mounts the same element twice', () => {
  const bad = el('div', { 'data-eddy-river': '../admin', 'data-size': 'enormous', 'data-theme': 'sepia', 'data-accent': 'red', 'data-embed': 'emb_nope' });
  const badge = el('span', { 'data-eddy-river': 'current', 'data-size': 'badge', 'data-size-x': 'x' });
  const { iframes, window } = boot([bad, badge]);
  assert.equal(iframes.length, 1, 'a slug that is not a slug mounts nothing');
  assert.equal(iframes[0].src, 'https://eddy.guide/embed/river/current?size=badge');
  assert.equal(iframes[0].style.display, 'inline-block', 'the badge sits inline in prose');

  (window.EddyEmbed as { scan: () => void }).scan();
  assert.equal(iframes.length, 1, 'a second scan is a no-op');
});

test('sizes each iframe from its own widget’s resize message and installs once', () => {
  const a = el('div', { 'data-eddy-river': 'current' });
  const b = el('div', { 'data-eddy-river': 'meramec' });
  const { iframes, listeners, window } = boot([a, b]);
  assert.equal(listeners.message?.length, 1);
  assert.equal(window.__eddyEmbedResizer, 1, 'the same guard the inline snippet uses, so both can coexist');

  listeners.message[0]({ data: { type: 'eddy-embed:resize', height: 412 }, source: iframes[1].contentWindow });
  assert.equal(iframes[1].style.height, '412px');
  assert.equal(iframes[0].style.height, '320px', 'the other frame keeps its placeholder height');

  listeners.message[0]({ data: { type: 'eddy-embed:resize', height: 40, width: 262 }, source: iframes[0].contentWindow });
  assert.equal(iframes[0].style.width, '262px');
  listeners.message[0]({ data: { type: 'something-else', height: 9 }, source: iframes[0].contentWindow });
  assert.equal(iframes[0].style.height, '40px');
});

test('a self-hosted copy points at its own origin', () => {
  const host = el('div', { 'data-eddy-river': 'current' });
  const { iframes } = boot([host], 'https://preview.example.com/embed.js');
  assert.ok(iframes[0].src?.startsWith('https://preview.example.com/embed/river/current'));
});
