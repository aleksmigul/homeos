#!/bin/bash
set -euo pipefail
cd /root/homeos
test -z "$(git status --porcelain)" || { echo "Workspace has uncommitted changes. Ask Codex to commit them before pushing." >&2; exit 1; }
git push origin main
