# CRITICAL: Fix for 404 Issue

## The Problem

Your build is running, but Vercel shows "No framework detected" and serves a 404. This happens when:
1. Root Directory isn't set correctly, OR
2. Vercel can't find the Next.js app in the expected location

## The Fix (Do This Now)

### Step 1: Verify Root Directory in Vercel

1. Go to: https://vercel.com/dashboard
2. Click your project: **floatme**
3. Click **Settings** (gear icon)
4. Scroll to **General** section
5. Find **Root Directory**
6. **MUST BE SET TO**: `missouri-float-planner`
7. If it's empty or wrong, click **Edit** and set it to `missouri-float-planner`
8. Click **Save**

### Step 2: Commit and Push

The `vercel.json` has been updated. Commit and push:

```bash
git add vercel.json
git commit -m "Fix Vercel configuration"
git push
```

### Step 3: Wait for New Deployment

1. Vercel will automatically trigger a new deployment
2. Watch the build logs
3. Look for: "Build Completed" (not just "Build Completed in /vercel/output")

### Step 4: Check Build Logs

The build should show:
- ✅ "Creating an optimized production build"
- ✅ "Compiled successfully"
- ✅ "Generating static pages"
- ✅ "Build Completed"

If you see errors, share them.

## What I Changed

1. **Updated `vercel.json`** - Removed incorrect `outputDirectory` (Next.js handles this automatically)
2. **Set `framework: "nextjs"`** - Explicitly tells Vercel this is Next.js
3. **Kept cron job config** - Your hourly gauge updates

## If Still 404 After This

1. **Check Function Logs** in the deployment:
   - Click on the deployment
   - Go to **Functions** tab
   - Look for errors when accessing `/`

2. **Test API endpoints first**:
   - `/api/test` - Should work if routing is fine
   - `/api/health` - Should show env vars
   - `/simple` - Simple test page

3. **Verify environment variables**:
   - Settings → Environment Variables
   - Must be set for **Production**
   - Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Most Likely Cause

If Root Directory is NOT set to `missouri-float-planner`, Vercel is looking for `package.json` in the repo root (which doesn't exist), so it doesn't detect Next.js and serves a 404.

**Double-check the Root Directory setting - this is 99% likely the issue!**
