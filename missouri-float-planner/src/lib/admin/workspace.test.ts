import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationState, BLOG_CATEGORIES } from './blog-publication';
import { adminPermission } from './permissions';
import { adminNavActive, canVisitAdminPage } from './navigation';
import { listPage, literalContains, visibleSelection } from './list-filters';
const now = Date.parse('2026-11-10T19:00:00Z');
test('publishing an existing draft with a null date produces a publicly queryable timestamp', () => {
  const result = publicationState('published', null, null, now);
  assert.equal(result.status, 'published');
  assert.ok(result.published_at);
  assert.ok(Date.parse(result.published_at!) <= now);
  assert.equal(
    publicationState('published', undefined, '2026-01-01T00:00:00Z', now)
      .published_at,
    '2026-01-01T00:00:00.000Z',
  );
  assert.equal(
    publicationState('published', '', null, now).published_at,
    new Date(now).toISOString(),
  );
});
test('scheduling requires an actual future date and publishing cannot silently schedule', () => {
  for (const value of [null, '', 'bad-date', '2026-01-01T00:00:00Z'])
    assert.throws(() => publicationState('scheduled', value, null, now));
  assert.equal(
    publicationState('scheduled', '2026-11-12T00:00:00Z', null, now).status,
    'scheduled',
  );
  assert.throws(() =>
    publicationState('published', '2026-11-12T00:00:00Z', null, now),
  );
  assert.ok(BLOG_CATEGORIES.includes('River Guides'));
});
test('roles deny unlisted actions and owner controls on the server', () => {
  assert.equal(adminPermission('editor', '/api/admin/blog/00000000-0000-4000-8000-000000000001', 'PUT'), true);
  assert.equal(
    adminPermission('moderator', '/api/admin/blog/00000000-0000-4000-8000-000000000001', 'PUT'),
    false,
  );
  assert.equal(
    adminPermission('moderator', '/api/admin/reports', 'PATCH'),
    true,
  );
  for (const role of ['editor', 'moderator'] as const)
    for (const path of [
      '/api/admin/team',
      '/api/admin/operations',
      '/api/admin/summary',
      '/api/admin/unknown-new-route',
    ])
      assert.equal(adminPermission(role, path, 'GET'), false);
  assert.equal(
    adminPermission(
      'moderator',
      '/api/admin/reports/123/ban-submitter',
      'POST',
    ),
    false,
  );
  assert.equal(
    adminPermission('editor', '/api/admin/social/config', 'PUT'),
    false,
  );
  assert.equal(
    adminPermission('editor', '/api/admin/social/new-dangerous-action', 'POST'),
    false,
  );
  assert.equal(
    adminPermission('editor', '/api/admin/social/tiktok/connect', 'GET'),
    false,
  );
  assert.equal(adminPermission('owner', '/api/admin/team', 'PUT'), true);
});
test('nested editing routes keep their active navigation and role access', () => {
  assert.equal(adminNavActive('/admin/blog/preview', '/admin/blog'), true);
  assert.equal(adminNavActive('/admin/blog', '/admin'), false);
  assert.equal(adminNavActive('/admin/blogger', '/admin/blog'), false);
  assert.equal(canVisitAdminPage('editor', '/admin/access-points/123'), true);
  assert.equal(canVisitAdminPage('moderator', '/admin/team'), false);
});
test('bulk action payload contains only selected rows visible in the current view', () => {
  assert.deepEqual(
    visibleSelection(new Set(['old-page', 'hidden-photo', 'visible']), [
      { id: 'visible' },
      { id: 'unselected' },
    ]),
    ['visible'],
  );
});
test('pagination is finite and PostgREST search treats punctuation/wildcards as text', () => {
  assert.deepEqual(listPage(new URLSearchParams('page=nope&limit=Infinity')), {
    page: 1,
    limit: 50,
    from: 0,
    to: 49,
  });
  assert.equal(listPage(new URLSearchParams('limit=999999')).limit, 200);
  assert.equal(
    JSON.parse(literalContains('50% _test, ("name")')),
    '%50\\% \\_test, ("name")%',
  );
});
