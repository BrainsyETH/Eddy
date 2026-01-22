# Fixing 404 Error on Vercel

If you're still getting a 404 error after setting environment variables, follow these steps:

## Step 1: Check Build Status

1. Go to Vercel Dashboard → Your Project → **Deployments**
2. Check if the latest deployment shows:
   - ✅ **Ready** (green) - Build succeeded
   - ❌ **Error** (red) - Build failed
   - ⏳ **Building** - Still in progress

## Step 2: Check Build Logs

If the build shows an error:
1. Click on the failed deployment
2. Open **Build Logs**
3. Look for:
   - TypeScript errors
   - Missing dependencies
   - Environment variable errors
   - Import errors

## Step 3: Test Endpoints

Try these URLs to diagnose:

1. **Health Check**: `https://floatme.vercel.app/api/health`
   - Should return JSON with environment variable status
   - If this works, routing is fine

2. **Test Endpoint**: `https://floatme.vercel.app/api/test`
   - Simple test to verify API routes work
   - Should return `{"status": "ok", "message": "Routing is working!"}`

3. **Rivers API**: `https://floatme.vercel.app/api/rivers`
   - Should return river list or error message
   - If this returns 404, there's a routing issue

## Step 4: Common Issues & Fixes

### Issue: Build Succeeds but 404 on Root

**Possible Causes:**
- Page component has runtime error
- Middleware is blocking requests
- Incorrect Vercel project configuration

**Fixes:**
1. Check Vercel project settings → **General** → **Root Directory**
   - Should be empty (not `missouri-float-planner`)
   - Unless you're in a monorepo

2. Check **Framework Preset**
   - Should be **Next.js**

3. Check **Build Command**
   - Should be `npm run build` or `next build`

4. Check **Output Directory**
   - Should be `.next` (default for Next.js)

### Issue: Build Fails

**Check:**
- Node.js version (should be 18.x or 20.x)
- All dependencies in `package.json`
- TypeScript errors: run `npm run build` locally

### Issue: Runtime Error

**Check:**
- Vercel Function Logs (in deployment details)
- Environment variables are set for **Production**
- Supabase connection is working

## Step 5: Force Redeploy

1. Go to Vercel Dashboard → Your Project → **Deployments**
2. Click the three dots on latest deployment
3. Select **Redeploy**
4. Or push an empty commit: `git commit --allow-empty -m "Redeploy" && git push`

## Step 6: Verify Environment Variables

Run this in your terminal to check what Vercel sees:

```bash
# Check health endpoint
curl https://floatme.vercel.app/api/health
```

Expected output should show which env vars are set.

## Step 7: Check Middleware

The middleware might be causing issues. If you suspect this:

1. Temporarily disable middleware by commenting out the matcher in `src/middleware.ts`
2. Redeploy
3. If it works, the middleware is the issue
4. Re-enable and fix the middleware

## Still Not Working?

1. **Check Vercel Status**: https://www.vercel-status.com/
2. **Check Domain Configuration**: Settings → Domains
3. **Contact Vercel Support** with:
   - Deployment URL
   - Build logs
   - Error messages from Function Logs
