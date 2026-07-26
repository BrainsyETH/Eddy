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
    "packages/eddy-types/index.ts",
    "packages/eddy-geo/index.ts",
    "packages/eddy-offline/index.ts",
    "packages/eddy-sync/index.ts",
    "packages/eddy-hazards/index.ts",
    "missouri-float-planner/shared/condition-system.ts",
]

# Nothing matching these may ever enter the archive.
FORBIDDEN_SUFFIXES = (".env",)
FORBIDDEN_PARTS = ("remotion", "node_modules", ".git/")


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
        print("pip install pathspec", file=sys.stderr)
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
