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

// Two folders outside the app that it imports from:
//   packages/                     — API contracts shared with the backend
//   missouri-float-planner/shared — the CANONICAL condition system
//
// The second matters more than it looks. shared/condition-system.ts is the
// single source of truth for condition colours, labels and orderings, and it
// says so explicitly: "Do not hardcode condition hex anywhere else; derive from
// CONDITION_SYSTEM." Reaching it here is what lets the app obey that instead of
// keeping its own drifting copy. It has zero imports, so React Native can
// consume it directly.
const sharedFolders = [
  path.resolve(repoRoot, 'packages'),
  path.resolve(repoRoot, 'missouri-float-planner/shared'),
];

const config = getDefaultConfig(projectRoot);

// Watch them so edits hot-reload like local files. These two lines are the
// whole mechanism — everything else stays default.
config.watchFolders = sharedFolders;

// NOTE: the widely-copied workspace-monorepo recipe also sets
// `nodeModulesPaths` + `disableHierarchicalLookup: true`. Do NOT do that here.
// Those exist to stop Metro resolving from a hoisted workspace root, but this
// project has a single node_modules and npm nests some transitive deps (e.g.
// expo-asset under node_modules/expo/). Disabling hierarchical lookup makes
// Metro refuse to look inside those nested folders and the bundle fails with
// "Unable to resolve module expo-asset". Default resolution is correct.

module.exports = config;
