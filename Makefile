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

.PHONY: help guard-node setup-web setup-mobile check-web check-mobile check-db \
        bundle-mobile check dev preflight-eas build-ios testflight check-eas-env

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

# Package scripts rather than the bare binaries, because `typecheck` now
# regenerates the typed-route declaration before running tsc (eddy-ios's
# package.json says why). Calling `npx tsc --noEmit` here would skip that and
# quietly reintroduce the stale-declaration failure this target exists to catch.
check-mobile: guard-node ## Mobile typecheck + lint (mirrors the mobile-app CI job, minus the bundle)
	cd $(MOBILE) && npm run typecheck && npm run lint

bundle-mobile: guard-node ## Credential-free production iOS bundle + .easignore allowlist check
	cd $(MOBILE) && npx expo export --platform ios --output-dir "$(EXPORT_DIR)"
	@# Same dependency dance as CI: the fallback covers PEP 668 runners.
	python3 -m pip install --quiet pathspec \
		|| python3 -m pip install --quiet --break-system-packages pathspec
	python3 $(MOBILE)/scripts/check-easignore.py

# Deliberately NOT part of `check`, and not in CI.
#
# It shells out to the Supabase CLI against a LINKED project, so it needs
# credentials and network that the hermetic jobs do not have and should not get.
# CI staying hermetic is the reason it cannot live in check-web.
#
# It is here because the alternative — a gate that exists and runs nowhere — has
# already cost something twice. 20260803170000_recalibrate_ozark_float_ladders
# was applied by hand and never recorded, so schema_migrations disagreed with the
# repo for a day while every effect sat in production, invisible from the app and
# from the console. Nothing surfaced it until this check was run by hand.
#
# Run it before a release, and after applying anything by hand. See
# docs/ios-release-runbook.md.
check-db: guard-node ## Migration drift: repo files vs the linked Supabase project
	@command -v npx >/dev/null || { echo "npx not found"; exit 1; }
	cd $(WEB) && npm run db:check-migrations

check: check-web check-mobile bundle-mobile ## Everything CI gates on

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
