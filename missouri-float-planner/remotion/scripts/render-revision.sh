#!/usr/bin/env bash
# Run from any directory in the checkout. Match build-remotion-image.yml's
# input paths. First-parent selects the merge SHA that actually built the image.
set -euo pipefail
git -C "$(git rev-parse --show-toplevel)" log --first-parent -1 --format=%H -- \
  missouri-float-planner/remotion missouri-float-planner/shared \
  missouri-float-planner/.dockerignore .github/workflows/build-remotion-image.yml
