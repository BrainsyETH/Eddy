#!/bin/bash
# Claude Code SessionStart hook. All setup logic lives in ../../bootstrap.sh so
# Codex, cloud setup scripts and fresh clones run the same steps.
#
# Cloud sessions only: on a local machine, Node and installs are yours to
# manage, and an unexpected install on every session start would be a surprise.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

exec "$CLAUDE_PROJECT_DIR/bootstrap.sh" all ${CLAUDE_ENV_FILE:+--env-file "$CLAUDE_ENV_FILE"}
