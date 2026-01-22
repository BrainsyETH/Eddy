# Fix: Vercel Root Directory Configuration

## The Problem

Your deployment is showing 404 because Vercel is building from the **root of the `Boards` repository**, but your Next.js app is in the `missouri-float-planner` subdirectory.

## The Solution

Set the **Root Directory** in Vercel to point to the `missouri-float-planner` folder.

### Steps:

1. Go to Vercel Dashboard → Your Project (`floatme`)
2. Click **Settings** (gear icon)
3. Go to **General** section
4. Scroll down to **Root Directory**
5. Click **Edit**
6. Enter: `missouri-float-planner`
7. Click **Save**

### What This Does

This tells Vercel:
- The `package.json` is in `missouri-float-planner/`
- The `next.config.mjs` is in `missouri-float-planner/`
- The `src/` directory is in `missouri-float-planner/src/`
- Build from that directory, not the repo root

### After Setting Root Directory

1. Vercel will automatically trigger a new deployment
2. Wait for it to complete (should show "Ready")
3. The 404 should be gone!

### Verify It Worked

After the new deployment completes:
- Visit `https://floatme.vercel.app/`
- Should see the Missouri Float Planner homepage
- Test `/simple` and `/api/test` endpoints

## Why This Happened

When you have a monorepo (multiple projects in one repo), Vercel needs to know which subdirectory contains your Next.js app. Without the Root Directory set, it looks for `package.json` in the repo root, doesn't find a Next.js app there, and serves a 404.
