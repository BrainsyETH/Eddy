// eddy-ios/metro.config.js
// Nearly default. The shared code this app consumes lives outside the project
// directory, and it is reached through ordinary node_modules resolution — see
// the `@eddy/*` file: dependencies in package.json — so there are no aliases
// here to keep in sync with anything.
//
// WHY NOT A WORKSPACE: Vercel builds the web app with Root Directory =
// missouri-float-planner/. Adding a root package.json with workspaces changes
// how installs resolve there, which risks a live deploy for no benefit to the
// backend. `file:` dependencies give one-directional sharing without a
// workspace: npm symlinks each package into this project's node_modules, and
// Vercel never sees any of it.
//
// ── Why aliases were abandoned ────────────────────────────────────────────
// Until SDK 57 these modules resolved through `watchFolders` plus tsconfig
// `compilerOptions.paths`. That combination is not viable on SDK 57 and the
// failure is production-only, so it is worth writing down:
//
//   * Expo's tsconfig-paths emulation stopped matching EXACT path mappings.
//     Wildcards (`@/*`) kept working, so `@eddy/types` failed while
//     `@/theme/x` resolved — from a tsconfig that had not changed.
//
//   * Metro's file map does not index files outside the project root during
//     `expo export`, whatever `watchFolders` says. Point a resolver at one and
//     the bundle dies with "Failed to get the SHA-1 for ...". `expo start`
//     indexes them fine, so the dev server works and every production bundle —
//     including every EAS build — fails.
//
// Symlinked node_modules is the path Metro actually supports (`enableSymlinks`
// is on in Expo's file map fork), and it needs no configuration at all.
//
// watchFolders below is therefore about EDITING, not resolution: it is what
// makes a change to packages/ or shared/ hot-reload instead of requiring a
// bundler restart.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  // @eddy/types, @eddy/geo, @eddy/sync, @eddy/hazards
  path.resolve(repoRoot, 'packages'),
  // @eddy/conditions — the CANONICAL condition system, which lives in the web
  // app because 38 files there import it. It is the single source of truth for
  // condition colours, labels and orderings, and says so explicitly: "Do not
  // hardcode condition hex anywhere else; derive from CONDITION_SYSTEM."
  // Consuming it here is what stops the app keeping a drifting copy.
  path.resolve(repoRoot, 'missouri-float-planner/shared'),
];

// NOTE: the widely-copied workspace-monorepo recipe also sets
// `nodeModulesPaths` + `disableHierarchicalLookup: true`. Do NOT do that here.
// Those exist to stop Metro resolving from a hoisted workspace root, but this
// project has a single node_modules and npm nests some transitive deps (e.g.
// expo-asset under node_modules/expo/). Disabling hierarchical lookup makes
// Metro refuse to look inside those nested folders and the bundle fails with
// "Unable to resolve module expo-asset". Default resolution is correct.

module.exports = config;
