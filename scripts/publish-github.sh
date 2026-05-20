#!/usr/bin/env bash
set -euo pipefail

owner="${GITHUB_OWNER:-$(gh api user --jq .login)}"
name="${1:-planning-center-services-mcp}"
visibility="${2:-public}"
description="Cloudflare Workers MCP server for Planning Center Services scheduling workflows"

if [[ "$visibility" != "public" && "$visibility" != "private" ]]; then
  echo "visibility must be public or private" >&2
  exit 1
fi

if ! gh repo view "$owner/$name" >/dev/null 2>&1; then
  private=false
  if [[ "$visibility" == "private" ]]; then
    private=true
  fi

  gh api user/repos \
    -X POST \
    -f "name=$name" \
    -f "description=$description" \
    -F "private=$private" \
    -f "auto_init=false" >/dev/null
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/$owner/$name.git"
fi

git push -u origin main
