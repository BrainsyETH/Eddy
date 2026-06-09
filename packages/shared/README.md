# @eddy/shared

Cross-platform types, zod schemas, API client, and pure business logic shared between `apps/web` and `apps/mobile`.

## Status

Empty placeholder during Week 1. Logic will be extracted from `apps/web/src/` in Week 2 as the mobile app is scaffolded.

## Rules

- **No React, no Next.js, no React Native imports** here. Web- and mobile-specific code stays in the respective `apps/`.
- Pure TypeScript only (types, utils, zod schemas, API client built on `fetch`).
- Anything that needs platform APIs (`window`, `AsyncStorage`, `next/headers`, etc.) belongs in `apps/*` not here.
