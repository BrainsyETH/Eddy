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

── UNTRACKED FILES COUNT, AND THIS SCRIPT USED TO MISS THEM ────────────────
The first version of this walked `git ls-files` alone. That is the one set of
paths whose size never mattered: .easignore exists precisely BECAUSE eas-cli
stops reading .gitignore, so the archive's whole risk lives in files git is not
tracking. The script reported a tidy 3 MB archive while a developer who had run
`npx expo run:ios` was uploading 2.5 GB of ios/Pods and hitting EAS's hard
limit.

So the walk below is tracked files PLUS untracked ones, including gitignored
ones — `--others` without `--exclude-standard` — collapsed to directories so a
node_modules tree does not turn this into a hundred-thousand-path enumeration.
node_modules and .git are pruned because eas-cli excludes those unconditionally
and nothing else does.

The size ceiling at the bottom is the generic backstop. Naming ios/ in
.easignore fixes today's offender; a ceiling catches tomorrow's without anyone
having to predict which directory it will be.
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
    "packages/eddy-offline/index.ts",
    "packages/eddy-sync/index.ts",
    "packages/eddy-hazards/index.ts",
    "missouri-float-planner/shared/condition-system.ts",
    # The package.json files are what make the `file:` dependencies resolve.
    # Without them in the archive, `npm ci` on the worker fails before Metro
    # ever runs.
    "packages/eddy-types/package.json",
    "packages/eddy-geo/package.json",
    "packages/eddy-offline/package.json",
    "packages/eddy-sync/package.json",
    "packages/eddy-hazards/package.json",
    "missouri-float-planner/shared/package.json",
]

# Nothing matching these may ever enter the archive.
FORBIDDEN_SUFFIXES = (".env",)
FORBIDDEN_PARTS = ("remotion", "node_modules", ".git/")

# EAS rejects anything over 2 GB outright. This sits far below that on purpose:
# the archive is source, and source that has grown past a couple of hundred
# megabytes means a build directory has leaked in. Failing here is a five-second
# local error instead of a three-minute upload that ends in a hard rejection.
MAX_ARCHIVE_BYTES = 200_000_000

# eas-cli excludes these unconditionally, whatever .easignore says, so they are
# pruned from the walk rather than measured.
PRUNED = ("node_modules", ".git")


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


def git(*args: str) -> list[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.splitlines()


def size_of(path: str) -> int:
    """Bytes at `path`, walking it when it is a directory."""
    target = ROOT / path
    if target.is_symlink() or not target.exists():
        return 0
    if target.is_file():
        return target.stat().st_size
    total = 0
    for child in target.rglob("*"):
        if child.is_file() and not child.is_symlink():
            try:
                total += child.stat().st_size
            except OSError:
                pass
    return total


def candidates() -> list[str]:
    """Everything eas-cli would consider, tracked or not.

    `--others` WITHOUT `--exclude-standard` is the important part: it returns
    untracked files including gitignored ones, which is exactly the set eas-cli
    uploads once .easignore exists. `--directory` collapses wholly-untracked
    directories to a single entry so this stays fast.
    """
    tracked = git("ls-files")
    untracked = git("ls-files", "--others", "--directory")
    seen = {p.rstrip("/") for p in tracked} | {p.rstrip("/") for p in untracked}
    return sorted(p for p in seen if p and p.split("/")[-1] not in PRUNED)


def main() -> None:
    patterns = load_patterns()
    entries = candidates()

    uploaded = [p for p in entries if not ignored(p, patterns)]

    total = sum(size_of(p) for p in uploaded)
    before = sum(size_of(p) for p in entries)

    print(f"archive: {len(uploaded)} entries, {total / 1e6:.2f} MB")
    print(f"without .easignore: {len(entries)} entries, {before / 1e6:.2f} MB")

    failures = []

    for required in REQUIRED:
        if required not in uploaded:
            failures.append(f"MISSING from archive (build would fail): {required}")

    for path in uploaded:
        if path.endswith(FORBIDDEN_SUFFIXES) or any(p in path for p in FORBIDDEN_PARTS):
            failures.append(f"UNEXPECTED in archive: {path}")

    if total > MAX_ARCHIVE_BYTES:
        # Name the offenders. "Too big" without a culprit sends people editing
        # .easignore by guesswork, which is how it grew a hole in the first place.
        biggest = sorted(((size_of(p), p) for p in uploaded), reverse=True)[:5]
        listing = ", ".join(f"{p} ({size / 1e6:.0f} MB)" for size, p in biggest)
        failures.append(
            f"ARCHIVE TOO BIG: {total / 1e6:.0f} MB exceeds the "
            f"{MAX_ARCHIVE_BYTES / 1e6:.0f} MB ceiling. Largest: {listing}"
        )

    roots = sorted({p.split("/")[0] for p in uploaded})
    print(f"top-level entries: {', '.join(roots)}")

    if failures:
        print()
        for failure in failures:
            print(f"  ✗ {failure}")
        raise SystemExit(1)

    print("ok — every Metro-resolved path present, no secrets or media, size sane")


if __name__ == "__main__":
    main()
