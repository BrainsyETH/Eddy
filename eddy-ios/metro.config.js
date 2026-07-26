// eddy-ios/metro.config.js
// Reaches the shared contracts in ../packages/eddy-types WITHOUT making the
// repo root an npm workspace.
//
// WHY NOT A WORKSPACE: Vercel builds the web app with Root Directory =
// missouri-float-planner/. Adding a root package.json with workspaces changes
// how installs resolve there, which risks a live deploy for no benefit to the
// backend. Metro can watch a folder outside the project instead, so the app
// gets one source of truth for API contracts and Vercel never sees any of it.
//
// Two things are required and easy to get wrong:
//   1. watchFolders — otherwise Metro refuses to bundle files outside the
//      project root ("Unable to resolve module ... outside of the project").
//   2. nodeModulesPaths — the shared folder has no node_modules of its own, so
//      resolution must fall back to the app's.
//
// Keep this in sync with the `@eddy/types` path alias in tsconfig.json:
// Metro handles the runtime resolution, tsconfig handles the types, and they
// are configured independently.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const sharedTypes = path.resolve(repoRoot, 'packages');

const config = getDefaultConfig(projectRoot);

// Watch the shared package so edits hot-reload like local files. This single
// line is the whole mechanism — everything else stays default.
config.watchFolders = [sharedTypes];

// NOTE: the widely-copied workspace-monorepo recipe also sets
// `nodeModulesPaths` + `disableHierarchicalLookup: true`. Do NOT do that here.
// Those exist to stop Metro resolving from a hoisted workspace root, but this
// project has a single node_modules and npm nests some transitive deps (e.g.
// expo-asset under node_modules/expo/). Disabling hierarchical lookup makes
// Metro refuse to look inside those nested folders and the bundle fails with
// "Unable to resolve module expo-asset". Default resolution is correct.

module.exports = config;
