# Root command interface. Every target is a thin wrapper over an existing
# package script or the exact command CI runs (.github/workflows/app-ci.yml);
# the application manifests stay authoritative. There is deliberately no root
# package.json or npm workspace — see docs/decisions/ and eddy-ios/README.md.

WEB    := missouri-float-planner
MOBILE := eddy-ios
# Outside the tree on purpose: bundle output must never become tracked source.
EXPORT_DIR := $(or $(TMPDIR),/tmp)/eddy-expo-export

.PHONY: help setup-web setup-mobile check-web check-mobile bundle-mobile check

help: ## List targets (default)
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup-web: ## Install web dependencies (npm ci in missouri-float-planner/)
	cd $(WEB) && npm ci

setup-mobile: ## Install mobile dependencies (plain npm ci — never --legacy-peer-deps)
	cd $(MOBILE) && npm ci

check-web: ## Web typecheck + lint + tests (mirrors the lint-and-typecheck CI job)
	cd $(WEB) && npm run typecheck && npm run lint && npm test

check-mobile: ## Mobile typecheck + lint (mirrors the mobile-app CI job, minus the bundle)
	cd $(MOBILE) && npx tsc --noEmit && npx expo lint

bundle-mobile: ## Credential-free production iOS bundle + .easignore allowlist check
	cd $(MOBILE) && npx expo export --platform ios --output-dir "$(EXPORT_DIR)"
	@# Same dependency dance as CI: the fallback covers PEP 668 runners.
	python3 -m pip install --quiet pathspec \
		|| python3 -m pip install --quiet --break-system-packages pathspec
	python3 $(MOBILE)/scripts/check-easignore.py

check: check-web check-mobile bundle-mobile ## Everything CI gates on
