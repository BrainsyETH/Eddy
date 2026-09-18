#!/usr/bin/env bash
set -euo pipefail
SCRIPT="$(cd "$(dirname "$0")/../scripts" && pwd)/render-revision.sh"
TEST_REPO=$(mktemp -d)
trap 'rm -rf "$TEST_REPO"' EXIT
cd "$TEST_REPO"
git init -q -b main
git config user.email fixture@example.invalid
git config user.name Fixture
mkdir -p missouri-float-planner/remotion missouri-float-planner/shared
printf 'v1' > missouri-float-planner/remotion/fixture
git add . && git commit -qm 'initial renderer'
BASE=$(git rev-parse HEAD)
printf 'unrelated' > README.md
git add . && git commit -qm 'unrelated change'
test "$(bash "$SCRIPT")" = "$BASE"
git switch -qc layout
printf 'v2' > missouri-float-planner/remotion/fixture
git add . && git commit -qm 'layout fix'
git switch -q main
git merge --no-ff -qm 'merge layout' layout
MERGE=$(git rev-parse HEAD)
test "$(bash "$SCRIPT")" = "$MERGE"
printf 'shared' > missouri-float-planner/shared/fixture
git add . && git commit -qm 'shared geometry'
SHARED=$(git rev-parse HEAD)
test "$(bash "$SCRIPT")" = "$SHARED"
printf 'unrelated 2' > README.md
git add . && git commit -qm 'unrelated change 2'
cd missouri-float-planner/remotion
test "$(bash "$SCRIPT")" = "$SHARED"
echo 'Renderer revision: merge SHA, shared changes, unrelated commits and nested cwd pass.'
