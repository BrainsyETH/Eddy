# Root command interface. Every target is a thin wrapper over an existing
# package script or the exact command CI runs (.github/workflows/app-ci.yml);
# the application manifests stay authoritative. There is deliberately no root
# package.json or npm workspace — see docs/decisions/ and eddy-ios/README.md.

WEB    := missouri-float-planner
MOBILE := eddy-ios
# Outside the tree on purpose: bundle output must never become tracked source.
EXPORT_DIR := $(or $(TMPDIR),/tmp)/eddy-expo-export
# One source of truth for the supported Node major, shared with CI and nvm.
NODE_MAJOR := $(shell sed 's/[^0-9].*//' .nvmrc 2>/dev/null)

.PHONY: help guard-node setup-web setup-mobile check-web check-mobile \
        mobile-types mobile-export bundle-mobile check dev preflight-eas \
        build-ios testflight check-eas-env

help: ## List targets (default)
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# WHY THIS IS A HARD FAILURE AND NOT A WARNING:
#
# npm only WARNS on an engines mismatch (EBADENGINE) and prints it in the middle
# of install output nobody reads. A session on Node 24 against this repo's Node
# 20 produced, in order: a native build that demanded code-signing certificates
# for a SIMULATOR target, an `expo install --fix` that resolved a different
# dependency graph than CI and downgraded a deliberately pinned major version,
# and a package-lock.json that `npm ci` then refused. None of those errors named
# Node. This target makes the mismatch the FIRST thing that fails, and says so.
guard-node: ## Fail unless the running Node matches .nvmrc
	@if [ -z "$(NODE_MAJOR)" ]; then \
		echo "make: cannot read .nvmrc at the repo root."; exit 1; \
	fi
	@have=`node -v 2>/dev/null | sed 's/^v//;s/\..*//'`; \
	if [ -z "$$have" ]; then \
		echo ""; \
		echo "  Node is not installed, or not on PATH."; \
		echo "  This repo requires Node $(NODE_MAJOR) — see .nvmrc."; \
		echo ""; \
		exit 1; \
	elif [ "$$have" != "$(NODE_MAJOR)" ]; then \
		echo ""; \
		echo "  Node `node -v` is not supported. This repo requires Node $(NODE_MAJOR) (.nvmrc)."; \
		echo ""; \
		echo "    nvm use          # from anywhere in the repo"; \
		echo "    nvm install $(NODE_MAJOR)   # if you do not have it yet"; \
		echo ""; \
		echo "  npm only warns about this, and the warning scrolls past."; \
		echo "  Installing on the wrong Node resolves a different dependency"; \
		echo "  graph than CI, which is how a lockfile stops matching."; \
		echo ""; \
		exit 1; \
	fi

setup-web: guard-node ## Install web dependencies (npm ci in missouri-float-planner/)
	cd $(WEB) && npm ci

setup-mobile: guard-node ## Install mobile dependencies (plain npm ci — never --legacy-peer-deps)
	cd $(MOBILE) && npm ci

check-web: guard-node ## Web typecheck + lint + tests (mirrors the lint-and-typecheck CI job)
	cd $(WEB) && npm run typecheck && npm run lint && npm test

# ── The typed-route declaration the mobile typecheck reads ──────────────────
#
# app.json sets experiments.typedRoutes, so expo-router emits the union of every
# route to .expo/types/router.d.ts. tsconfig.json includes it; .gitignore
# ignores it; nothing in git has ever tracked it. It is written ONLY when the
# dev server or an export runs.
#
# THAT MADE THE TWO ENVIRONMENTS DISAGREE, IN OPPOSITE DIRECTIONS:
#
#   CI       typechecked before anything generated it, so `Href` degraded to
#            something permissive and route errors COULD NOT FIRE. Three sat
#            green for a week (see src/lib/href.ts).
#   A Mac    had a copy generated whenever the dev server last ran, so a route
#            added since read as invalid — a valid push to a new screen failing
#            a check nobody could reproduce in CI.
#
# So the declaration is a real build artifact with real inputs, and make is
# allowed to treat it as one. Depending on the route files means the export
# re-runs when a route is added, renamed or deleted, and is SKIPPED for the
# ordinary edit that touches a component — which is what keeps check-mobile the
# quick target it is meant to be.
#
# The directories are prerequisites alongside the files because deleting a route
# bumps only its parent's mtime.
ROUTER_TYPES := $(MOBILE)/.expo/types/router.d.ts

# One definition, two callers, so the conditional path and the unconditional one
# can never drift into exporting differently.
EXPO_EXPORT = cd $(MOBILE) && npx expo export --platform ios --output-dir "$(EXPORT_DIR)"

# THE STALENESS TEST IS IN SHELL, NOT IN A PREREQUISITE LIST, and that is not a
# style choice. Expo Router's own convention puts a route group in parentheses —
# eddy-ios/app/(tabs) — and GNU make reads `dir(member)` as archive syntax, so
# naming those paths as prerequisites fails with "No rule to make target
# 'eddy-ios/app/(tabs)'". Every route under the tab bar lives there. `find` has
# no such quarrel with parentheses.
#
# `| head -1` rather than find's -quit: -quit is a GNU/BSD extension and this has
# to behave the same on a developer's macOS find as on CI's. head closes the
# pipe after the first hit, so the walk still stops early.
#
# Directories are in `find`'s output too, which is what catches a DELETED route:
# removing a file bumps only its parent's mtime.
#
# The export runs in a SUBSHELL because it begins with `cd $(MOBILE)` — without
# the parentheses that cd leaks into the touch below, which then silently misses
# (it is `|| true`) and leaves the declaration older than its inputs, so every
# subsequent run re-exports.
mobile-types: guard-node ## Regenerate the typed-route declaration if a route changed
	@if [ ! -f "$(ROUTER_TYPES)" ] || \
	   [ -n "`find $(MOBILE)/app -newer "$(ROUTER_TYPES)" -print 2>/dev/null | head -1`" ]; then \
		echo "routes changed — regenerating $(ROUTER_TYPES)"; \
		( $(EXPO_EXPORT) ) && touch "$(ROUTER_TYPES)"; \
	else \
		echo "route declaration is current"; \
	fi

mobile-export: guard-node ## Force the iOS bundle (and with it the route declaration)
	$(EXPO_EXPORT)

check-mobile: guard-node mobile-types ## Mobile typecheck + lint (mirrors the mobile-app CI job)
	cd $(MOBILE) && npx tsc --noEmit && npx expo lint

# UNCONDITIONAL on purpose. This is the target that catches Metro and EAS
# breakage invisible in dev, so it must actually bundle every time — reusing the
# mtime-guarded rule above would let it silently skip the one thing it is for.
bundle-mobile: guard-node mobile-export ## Credential-free production iOS bundle + .easignore allowlist check
	@# Same dependency dance as CI: the fallback covers PEP 668 runners.
	python3 -m pip install --quiet pathspec \
		|| python3 -m pip install --quiet --break-system-packages pathspec
	python3 $(MOBILE)/scripts/check-easignore.py

# BUNDLE BEFORE TYPECHECK, matching the CI job's order and for the same reason:
# the export is what writes the typed-route declaration, so typechecking first
# means typechecking against whatever happened to be on disk. The cost is that a
# bundle failure now masks a type error, which is the right way round — a slower
# red beats a green that cannot see the error class it was added to catch.
#
# It also means one export per `make check`: bundle-mobile refreshes the
# declaration, so check-mobile's mtime rule finds it current and skips its own.
check: check-web bundle-mobile check-mobile ## Everything CI gates on

# ── Running and shipping the app ────────────────────────────────────────────
#
# Three commands, and they are the whole interface. See
# docs/ios-release-runbook.md for what each one assumes.

dev: guard-node ## Run the app locally (then press s for Expo Go, then i)
	cd $(MOBILE) && npx expo start

# THE ARTIFACT TRAP THIS CLOSES:
#
# `expo prebuild` and `expo run:ios` GENERATE eddy-ios/ios/. They are commands
# you are supposed to run. But precompiled Swift modules under ios/build/ record
# the absolute path of the machine that made them, so if that directory reaches
# the EAS worker the build dies with `missing required module 'SwiftShims'` and
# a path from someone's laptop. Deleting it before every cloud build is not
# something to remember — it is a prerequisite, so it lives here.
preflight-eas: guard-node
	@echo "==> Removing generated native projects (they must never enter the EAS archive)"
	rm -rf $(MOBILE)/ios $(MOBILE)/android
	@python3 -m pip install --quiet pathspec \
		|| python3 -m pip install --quiet --break-system-packages pathspec
	python3 $(MOBILE)/scripts/check-easignore.py

build-ios: preflight-eas ## Safe EAS build for internal distribution (device testing)
	cd $(MOBILE) && npx eas-cli@latest build --profile preview --platform ios

testflight: preflight-eas ## Production EAS build, submitted to TestFlight
	cd $(MOBILE) && npx eas-cli@latest build --profile production --platform ios --auto-submit

check-eas-env: ## Compare EAS variable NAMES across preview and production
	bash $(MOBILE)/scripts/check-eas-env.sh
