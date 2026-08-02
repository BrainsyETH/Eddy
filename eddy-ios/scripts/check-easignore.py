#!/usr/bin/env python3
"""Report what EAS Build would upload, and assert the archive is sane.

    python3 eddy-ios/scripts/check-easignore.py

WHY THIS EXISTS: .easignore is written as an allowlist, and an allowlist that
silently stops matching is indistinguishable from one that works right up until
the build fails on the worker. Worse, when .easignore exists eas-cli ignores
.gitignore completely, so a mistake here uploads .env files rather than merely
wasting bandwidth. Both failure modes are checked below.

This re-implements gitignore matching rather than shelling out to `git
check-ignore`, because git refuses to apply an arbitrary ignore file to already-
tracked paths — which is every path we care about.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Paths Metro resolves at bundle time. If any of these stop being uploaded the
# build breaks on the worker, not here, so they are asserted.
REQUIRED = [
    "eddy-ios/app.json",
    "eddy-ios/metro.config.js",
    "eddy-ios/assets/icon.png",
    "eddy-ios/app/(tabs)/index.tsx",
    "eddy-ios/package-lock.json",
    "packages/eddy-types/index.ts",
    "packages/eddy-geo/index.ts",
    "packages/eddy-sync/index.ts",
    "packages/eddy-hazards/index.ts",
    "missouri-float-planner/shared/condition-system.ts",
    # The package.json files are what make the `file:` dependencies resolve.
    # Without them in the archive, `npm ci` on the worker fails before Metro
    # ever runs.
    "packages/eddy-types/package.json",
    "packages/eddy-geo/package.json",
    "packages/eddy-sync/package.json",
    "packages/eddy-hazards/package.json",
    "missouri-float-planner/shared/package.json",
]

# Nothing matching these may ever enter the archive.
FORBIDDEN_SUFFIXES = (".env",)
FORBIDDEN_PARTS = ("remotion", "node_modules", ".git/")

# Paths that must be DENIED by .easignore whether or not they exist here.
#
# This list is the one that would have caught the 1.8 GB upload. Every other
# check in this file walks `git ls-files`, so it can only ever see TRACKED
# paths — and the things that blow up an archive are generated and therefore
# untracked. A machine that has never run `expo run:ios` has no eddy-ios/ios/
# to notice, so the check passed here and the build failed on the worker.
#
# Testing the RULE instead of the filesystem is what makes that impossible:
# these are hypothetical paths, matched against the patterns directly.
MUST_BE_IGNORED = [
    # Generated native projects. EAS runs prebuild itself and needs the config,
    # never the output — and a stale one is preferred over the one the worker
    # would generate, so it fails naming a Swift module rather than an upload.
    "eddy-ios/ios/Podfile",
    "eddy-ios/ios/Pods/boost/boost/version.hpp",
    "eddy-ios/ios/build/ModuleCache.noindex/1FY9/SwiftShims-ABC.pcm",
    "eddy-ios/android/gradlew",
    "eddy-ios/android/app/build/outputs/apk/app.apk",
    # Secrets. .gitignore is not consulted once this file exists, so these are
    # uploaded unless denied HERE.
    "eddy-ios/.env",
    "eddy-ios/.env.local",
    "missouri-float-planner/.env.local",
    # Local Expo state.
    "eddy-ios/.expo/devices.json",
    "eddy-ios/dist/index.js",
]


def load_patterns() -> list[str]:
    text = (ROOT / ".easignore").read_text()
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def ignored(path: str, patterns: list[str]) -> bool:
    """Apply gitignore semantics in order; last matching pattern wins.

    A directory excluded by an earlier pattern cannot have its children
    re-included, which is exactly why .easignore walks down level by level.
    """
    try:
        # GitIgnoreSpecPattern, not the GitWildMatchPattern re-exported from
        # pathspec.patterns — that alias is deprecated and warns on every call.
        from pathspec.patterns.gitwildmatch import GitIgnoreSpecPattern as GitWildMatchPattern
    except ImportError:
        # Exit 2, loudly. This used to print `pip install pathspec` and nothing
        # else, which reads as a suggestion rather than a failure — and when the
        # allowlist is what stands between a build and uploading .env files,
        # "the check did not run" must never be mistakable for "the check
        # passed". `make bundle-mobile` installs this dependency for you; the
        # message is for anyone invoking the script directly.
        print(
            "\n  check-easignore did NOT run: the pathspec package is missing.\n"
            "\n  This check is the only thing verifying that .easignore still"
            "\n  denies what it must. It has NOT verified anything.\n"
            "\n    python3 -m pip install --user pathspec\n"
            "\n  or run it through `make bundle-mobile`, which installs it.\n",
            file=sys.stderr,
        )
        raise SystemExit(2)

    result = False
    # Test every ancestor as well as the path: excluding `foo` excludes `foo/bar`.
    segments = path.split("/")
    candidates = ["/".join(segments[: i + 1]) for i in range(len(segments))]

    for raw in patterns:
        pattern = GitWildMatchPattern(raw)
        if pattern.regex is None:
            continue
        # `include` is True for an ordinary pattern and False for a `!` negation,
        # so a match simply sets the verdict and a later pattern may flip it.
        matched = any(
            pattern.regex.match(probe)
            for candidate in candidates
            for probe in (candidate, candidate + "/")
        )
        if matched:
            result = bool(pattern.include)
    return result


def main() -> None:
    patterns = load_patterns()
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.splitlines()

    uploaded = [p for p in tracked if not ignored(p, patterns)]

    total = sum((ROOT / p).stat().st_size for p in uploaded if (ROOT / p).exists())
    before = sum((ROOT / p).stat().st_size for p in tracked if (ROOT / p).exists())

    print(f"archive: {len(uploaded)} files, {total / 1e6:.2f} MB")
    print(f"without .easignore: {len(tracked)} files, {before / 1e6:.2f} MB")

    failures = []

    for required in REQUIRED:
        if required not in uploaded:
            failures.append(f"MISSING from archive (build would fail): {required}")

    for path in uploaded:
        if path.endswith(FORBIDDEN_SUFFIXES) or any(p in path for p in FORBIDDEN_PARTS):
            failures.append(f"UNEXPECTED in archive: {path}")

    # The rule, not the filesystem — see MUST_BE_IGNORED.
    for path in MUST_BE_IGNORED:
        if not ignored(path, patterns):
            failures.append(f"WOULD BE UPLOADED (must be denied): {path}")

    roots = sorted({p.split("/")[0] for p in uploaded})
    print(f"top-level entries: {', '.join(roots)}")

    if failures:
        print()
        for failure in failures:
            print(f"  ✗ {failure}")
        raise SystemExit(1)

    print("ok — every Metro-resolved path present, no secrets or media")


if __name__ == "__main__":
    main()
