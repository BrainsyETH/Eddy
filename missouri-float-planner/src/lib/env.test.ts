import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditEnv,
  checkWriteTarget,
  formatEnvAudit,
  projectRefFromUrl,
  resolveSupabaseAdmin,
} from './env';

// A complete, valid core env for audit tests. Values are placeholders — the
// audit only checks presence, never validity.
const CORE_OK = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  CRON_SECRET: 'cron',
  ADMIN_API_SECRET: 'admin',
  NEXT_PUBLIC_SITE_URL: 'https://eddy.guide',
};

test('projectRefFromUrl parses hosted project URLs', () => {
  assert.equal(projectRefFromUrl('https://ilefwfpvphadsbptiaur.supabase.co'), 'ilefwfpvphadsbptiaur');
  assert.equal(projectRefFromUrl('http://abc123.supabase.co/rest/v1'), 'abc123');
});

test('projectRefFromUrl returns null for anything else', () => {
  assert.equal(projectRefFromUrl('https://example.com'), null);
  assert.equal(projectRefFromUrl('https://evil.com/x.supabase.co'), null);
  assert.equal(projectRefFromUrl(''), null);
});

test('resolveSupabaseAdmin prefers the canonical convention and reports no legacy use', () => {
  const r = resolveSupabaseAdmin({
    NEXT_PUBLIC_SUPABASE_URL: 'https://aaa.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'srk',
    // Legacy names present too — must NOT be reported when canonical wins.
    SUPABASE_URL: 'https://bbb.supabase.co',
    SUPABASE_KEY: 'legacy',
  });
  assert.ok(r.ok);
  assert.equal(r.url, 'https://aaa.supabase.co');
  assert.equal(r.serviceRoleKey, 'srk');
  assert.equal(r.ref, 'aaa');
  assert.deepEqual(r.legacyNames, []);
});

test('resolveSupabaseAdmin falls back to legacy names and says so', () => {
  const r = resolveSupabaseAdmin({
    SUPABASE_URL: 'https://bbb.supabase.co',
    SUPABASE_KEY: 'legacy',
  });
  assert.ok(r.ok);
  assert.equal(r.ref, 'bbb');
  assert.deepEqual(r.legacyNames, ['SUPABASE_URL', 'SUPABASE_KEY']);
});

test('resolveSupabaseAdmin reports exactly what is missing', () => {
  const r = resolveSupabaseAdmin({ NEXT_PUBLIC_SUPABASE_URL: 'https://aaa.supabase.co' });
  assert.ok(!r.ok);
  assert.deepEqual(r.missing, ['serviceRoleKey']);
  assert.match(r.message, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('checkWriteTarget refuses an unparseable target', () => {
  const v = checkWriteTarget(null, 'aaa');
  assert.ok(!v.ok);
  assert.equal(v.reason, 'unknown-ref');
});

test('checkWriteTarget refuses an unpinned write and names the export line', () => {
  const v = checkWriteTarget('aaa', undefined);
  assert.ok(!v.ok);
  assert.equal(v.reason, 'unpinned');
  // The remedy must be copy-paste complete — this line is the whole point.
  assert.match(v.message, /export EXPECTED_SUPABASE_REF=aaa/);
});

test('checkWriteTarget refuses a mismatched pin', () => {
  const v = checkWriteTarget('aaa', 'bbb');
  assert.ok(!v.ok);
  assert.equal(v.reason, 'mismatch');
  assert.match(v.message, /'aaa'/);
  assert.match(v.message, /'bbb'/);
});

test('checkWriteTarget passes a matching pin', () => {
  const v = checkWriteTarget('aaa', 'aaa');
  assert.ok(v.ok);
  assert.equal(v.ref, 'aaa');
});

test('auditEnv is clean on a complete core env', () => {
  const audit = auditEnv(CORE_OK);
  assert.deepEqual(audit.missingCore, []);
  assert.deepEqual(audit.missingAnyOf, []);
  assert.deepEqual(audit.missingRecommended, []);
  assert.deepEqual(audit.partialFeatures, []);
  assert.deepEqual(formatEnvAudit(audit), []);
});

test('auditEnv flags missing core vars, including empty strings', () => {
  const audit = auditEnv({ ...CORE_OK, CRON_SECRET: '', SUPABASE_SERVICE_ROLE_KEY: undefined });
  assert.deepEqual(audit.missingCore.sort(), ['CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']);
});

test('auditEnv accepts either admin secret and flags when both are absent', () => {
  const { ADMIN_API_SECRET: _drop, ...rest } = CORE_OK;
  assert.deepEqual(auditEnv({ ...rest, ADMIN_PASSWORD: 'pw' }).missingAnyOf, []);
  assert.deepEqual(auditEnv(rest).missingAnyOf, ['ADMIN_API_SECRET or ADMIN_PASSWORD']);
});

test('auditEnv flags a partially configured feature group, not an absent one', () => {
  // Fully absent group: valid "feature off" — silent.
  assert.deepEqual(auditEnv(CORE_OK).partialFeatures, []);

  // Half-configured Meta posting: the misconfiguration this exists to catch.
  const audit = auditEnv({ ...CORE_OK, META_PAGE_ACCESS_TOKEN: 'tok' });
  assert.equal(audit.partialFeatures.length, 1);
  assert.equal(audit.partialFeatures[0].feature, 'meta-posting');
  assert.deepEqual(audit.partialFeatures[0].present, ['META_PAGE_ACCESS_TOKEN']);
  assert.deepEqual(audit.partialFeatures[0].missing.sort(), [
    'META_INSTAGRAM_ACCOUNT_ID',
    'META_PAGE_ID',
  ]);
  assert.match(formatEnvAudit(audit).join('\n'), /PARTIALLY configured/);
});
