import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminToken,
  requireAdminAuth,
} from './admin-auth';

const SECRET = 'test-only-admin-secret';

async function withAdminSecret<T>(run: () => Promise<T>): Promise<T> {
  const originalSecret = process.env.ADMIN_API_SECRET;
  process.env.ADMIN_API_SECRET = SECRET;
  try {
    return await run();
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = originalSecret;
  }
}

function request(
  method: string,
  token?: string,
  headers: Record<string, string> = {}
) {
  return new NextRequest('https://eddy.guide/api/admin/rivers', {
    method,
    headers: {
      ...headers,
      ...(token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {}),
    },
  });
}

test('admin auth accepts a valid HttpOnly-session token', async () => {
  await withAdminSecret(async () => {
    const token = createAdminToken();
    assert.equal(await requireAdminAuth(request('GET', token)), null);
  });
});

test('admin auth rejects requests without a session', async () => {
  await withAdminSecret(async () => {
    const response = await requireAdminAuth(request('GET'));
    assert.equal(response?.status, 401);
    assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  });
});

test('cookie-authenticated writes require the exact same Origin', async () => {
  await withAdminSecret(async () => {
    const token = createAdminToken();
    const missingOrigin = await requireAdminAuth(request('POST', token));
    const foreignOrigin = await requireAdminAuth(
      request('POST', token, { origin: 'https://attacker.example' })
    );
    const sameOrigin = await requireAdminAuth(
      request('POST', token, { origin: 'https://eddy.guide' })
    );

    assert.equal(missingOrigin?.status, 403);
    assert.equal(foreignOrigin?.status, 403);
    assert.equal(sameOrigin, null);
  });
});

test('valid bearer tokens remain available for trusted scripts', async () => {
  await withAdminSecret(async () => {
    const token = createAdminToken();
    const bearerRequest = new NextRequest('https://eddy.guide/api/admin/rivers', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(await requireAdminAuth(bearerRequest), null);
  });
});

test('named roles are loaded from the server on each request, never from the token', async()=>{
 await withAdminSecret(async()=>{
  const originalFetch=globalThis.fetch;const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://admin-auth-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
  let role='editor';let active=true;let unavailable=false;
  globalThis.fetch=async()=>new Response(JSON.stringify(unavailable?{message:'unavailable'}:{user_id:'11111111-1111-4111-8111-111111111111',name:'Editor',role,active}),{status:unavailable?503:200,headers:{'Content-Type':'application/json'}});
  try{
   const token=createAdminToken('11111111-1111-4111-8111-111111111111');
   const req=(path:string)=>new NextRequest(`https://eddy.guide${path}`,{headers:{authorization:`Bearer ${token}`}});
   assert.equal(await requireAdminAuth(req('/api/admin/blog')),null);
   assert.equal((await requireAdminAuth(req('/api/admin/team')))?.status,403);
   role='owner';assert.equal(await requireAdminAuth(req('/api/admin/team')),null);
   active=false;assert.equal((await requireAdminAuth(req('/api/admin/team')))?.status,403);
   unavailable=true;assert.equal((await requireAdminAuth(req('/api/admin/team')))?.status,503);
  }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;}
 });
});
test('disabling recovery also revokes already issued shared sessions',async()=>{
 await withAdminSecret(async()=>{const token=createAdminToken();const original=process.env.ADMIN_ALLOW_RECOVERY_ACCESS;process.env.ADMIN_ALLOW_RECOVERY_ACCESS='false';try{assert.equal((await requireAdminAuth(request('GET',token)))?.status,401);}finally{if(original===undefined)delete process.env.ADMIN_ALLOW_RECOVERY_ACCESS;else process.env.ADMIN_ALLOW_RECOVERY_ACCESS=original;}});
});
