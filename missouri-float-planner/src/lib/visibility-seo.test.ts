import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { accessFeeSchema, publicPageMetadata } from './seo';
import ArticleByline from '../components/blog/ArticleByline';
import ConditionsLayout from '../components/conditions/ConditionsLayout';
import type { ConditionsExplorerProps } from '../components/conditions/ConditionsExplorer';
import { conditionsDamCatalogue } from './conditions/dam-catalogue';
import type { RiverListItem } from '../types/api';

test('Next upgrades require reviewing the copied default crawler list', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require('next/package.json').version, '16.4.3',
    'Next changed: compare its default HTML-limited crawler list with next.config.mjs, then update this version guard.');
});

test('emitted CSP permits public analytics and isolates admin diagrams', async () => {
  const imported = await import(pathToFileURL(resolve('next.config.mjs')).href);
  const config = typeof imported.default === 'function' ? await imported.default('phase-production-build', { defaultConfig: {} }) : imported.default;
  // A banner emitted after </head> is too late for native Safari UI.
  assert.ok(config.htmlLimitedBots.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'));
  assert.ok(config.htmlLimitedBots.test('Twitterbot/1.0'));
  assert.ok(config.htmlLimitedBots.test('Google-InspectionTool/1.0'));
  assert.ok(!config.htmlLimitedBots.test('Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'));
  const rules = await config.headers();
  let policies = 0;
  let guidePolicies = 0;
  for (const rule of rules) {
    for (const header of rule.headers) {
      if (header.key.toLowerCase() !== 'content-security-policy') continue;
      const directives = new Map<string, string[]>(header.value.split(';').map((part: string) => {
        const [key, ...sources] = part.trim().split(/\s+/);
        return [key, sources];
      }));
      if (rule.source === '/admin/visuals/:filename') {
        guidePolicies++;
        assert.equal(rule, rules.at(-1), 'the guide policy must override the general app policy');
        assert.deepEqual(directives.get('default-src'), ["'none'"]);
        assert.deepEqual(directives.get('connect-src'), ["'none'"]);
        assert.deepEqual(directives.get('font-src'), ['data:']);
        assert.deepEqual(directives.get('img-src'), ['data:']);
        assert.deepEqual(directives.get('script-src'), ["'unsafe-inline'"]);
        assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
        continue;
      }
      policies++;
      for (const host of ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://*.google.com']) {
        assert.ok(directives.get('connect-src')?.includes(host), `${rule.source} blocks ${host}`);
      }
      assert.ok(directives.get('script-src')?.includes('https://www.googletagmanager.com'));
      assert.ok(!directives.get('connect-src')?.includes('*'));
      assert.ok(!directives.get('connect-src')?.includes('https://www.googletagmanager.com'), 'GTM wildcard already includes www');
      assert.ok(!directives.get('connect-src')?.some(host => host.includes('doubleclick.net')));
      assert.deepEqual(directives.get('object-src'), ["'none'"]);
    }
  }
  assert.equal(policies, 2);
  assert.equal(guidePolicies, 1);
});

const directoryRivers: RiverListItem[] = Array.from({ length: 12 }, (_, index) => {
  const slug = index === 0 ? 'current' : `river-${index}`;
  return {
    id: slug, slug, name: index === 0 ? 'Current River' : `River ${index}`, state: 'MO', path: `/rivers/missouri/${slug}`,
    lengthMiles: 100, description: 'Spring-fed Ozark floating.', difficultyRating: 'I', region: 'Ozarks', riverType: 'spring_fed_float', accessPointCount: 12, currentCondition: null,
  };
});

function renderConditions(overrides: Partial<ConditionsExplorerProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const noop = () => {};
  const router: AppRouterInstance = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, bfcacheId: 'test' };
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(AppRouterContext.Provider, { value: router },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
          createElement(ConditionsLayout, { rivers: directoryRivers, ...conditionsDamCatalogue([]), renderedAt: Date.now(), ...overrides }))),
    ));
  } finally { client.clear(); }
}

test('the actual Conditions layout links to every destination before JavaScript, beyond its previews', () => {
  const html = renderConditions();
  assert.match(html, /<h1[^>]*>Conditions<\/h1>/);
  const directory = html.match(/<section aria-label="A–Z directory"[\s\S]*?<\/section>/)?.[0];
  assert.ok(directory, 'the browsing layout must include the complete directory');
  for (const river of directoryRivers) {
    assert.ok(directory.includes(`href="${river.path}"`), `missing canonical river link: ${river.slug}`);
    assert.ok(directory.includes(river.name));
  }
  for (const dam of conditionsDamCatalogue([]).dams) {
    assert.ok(directory.includes(`href="/dams/${dam.id}"`), `missing dam link: ${dam.id}`);
  }
  assert.equal((directory.match(/<a /g) ?? []).length, directoryRivers.length + conditionsDamCatalogue([]).dams.length);
  assert.doesNotMatch(html, /No rivers found/);
  assert.match(html, /USGS readings can lag actual river conditions/);
});

test('the dams entry has its own visible heading and every dam in the initial HTML', () => {
  const html = renderConditions({ defaultKind: 'dams' });
  assert.match(html, /<h1[^>]*>Lakes &amp; Dams<\/h1>/);
  assert.doesNotMatch(html, /<h1[^>]*>Conditions<\/h1>/);
  for (const dam of conditionsDamCatalogue([]).dams) assert.ok(html.includes(`href="/dams/${dam.id}"`));
});

test('paid access is never marked free, and unknown fees remain unspecified', () => {
  assert.deepEqual(accessFeeSchema(true), { isAccessibleForFree: false });
  assert.deepEqual(accessFeeSchema(false), { isAccessibleForFree: true });
  assert.deepEqual(accessFeeSchema(null), {});
  assert.deepEqual(accessFeeSchema(undefined), {});
});

test('public metadata names the actual page instead of inheriting the homepage', () => {
  const metadata = publicPageMetadata('Lake Levels', 'Dam release schedules.', '/dams', '/opengraph-image');
  assert.equal(metadata.alternates?.canonical, '/dams');
  assert.equal(metadata.openGraph?.url, '/dams');
  assert.equal(metadata.openGraph?.title, 'Lake Levels');
  assert.equal(metadata.twitter?.title, 'Lake Levels');
  assert.deepEqual(metadata.openGraph?.images, [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Eddy — live river conditions, water levels, and float trip plans' }]);
  assert.deepEqual(metadata.twitter?.images, ['/opengraph-image']);
  const riverMetadata = publicPageMetadata('River Reports', 'Live river levels.', '/rivers');
  assert.ok(!Object.hasOwn(riverMetadata.openGraph!, 'images'), 'preserve route-specific file-based river images');
});

test('guide bylines never interpret operational update timestamps as editorial dates', () => {
  const post = { publishedAt: '2026-07-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' };
  const before = renderToStaticMarkup(createElement(ArticleByline, post));
  const sharedPost = { ...post, updatedAt: '2026-10-04T00:00:00Z' };
  const afterShare = renderToStaticMarkup(createElement(ArticleByline, sharedPost));
  assert.equal(afterShare, before);
  assert.match(before, /Published July 1, 2026/);
  assert.doesNotMatch(before, /Updated|Reviewed|2026-09|2026-10/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ArticleByline, { publishedAt: null })), /<time/);
});
