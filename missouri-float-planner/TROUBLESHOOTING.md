# Troubleshooting Production Issues

## 404 Error on Production

If you're seeing a 404 error on your production site (e.g., `floatme.vercel.app`), check the following:

### 1. Check Environment Variables in Vercel

Go to your Vercel project → **Settings** → **Environment Variables** and ensure these are set:

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (keep secret!)

**Optional but recommended:**
- `MAPBOX_ACCESS_TOKEN` - For drive time calculations

**Important:** Make sure these are set for **Production** environment (not just Preview/Development).

### 2. Check Build Logs

1. Go to Vercel Dashboard → Your Project → **Deployments**
2. Click on the latest deployment
3. Check the **Build Logs** for any errors
4. Common issues:
   - Missing environment variables
   - TypeScript errors
   - Build timeouts

### 3. Check Health Endpoint

Visit: `https://floatme.vercel.app/api/health`

This will show you which environment variables are set. If any required ones are missing, that's likely the issue.

### 4. Verify Middleware

The middleware runs on every request. If Supabase env vars are missing, it will now gracefully skip (instead of crashing), but some features may not work.

### 5. Common Fixes

**If build succeeds but site shows 404:**
- Check that your Vercel project is connected to the correct Git branch
- Verify the build output directory (should be `.next` for Next.js)
- Check Vercel project settings → **General** → **Root Directory** (should be empty or `missouri-float-planner` if in a monorepo)

**If build fails:**
- Check for TypeScript errors: `npm run build` locally
- Verify all dependencies are in `package.json`
- Check Node.js version in Vercel (should match your local version)

**If runtime errors:**
- Check Vercel Function Logs in the dashboard
- Look for errors related to missing environment variables
- Verify Supabase connection is working

### 6. Quick Test

1. Set all required environment variables in Vercel
2. Redeploy (or push a new commit)
3. Check `/api/health` endpoint
4. Check `/api/rivers` endpoint (should return river list or error message, not 404)

### 7. Still Not Working?

- Check Vercel's status page: https://www.vercel-status.com/
- Review Vercel deployment logs for specific error messages
- Try redeploying from the Vercel dashboard
- Check if your domain is correctly configured
