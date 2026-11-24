#!/bin/zsh
# build.sh <services worktree> <content worktree> <output dir>
set -euo pipefail
source ~/.nvm/nvm.sh >/dev/null && nvm use 24.18.0 >/dev/null
cd "$1"
[[ -d node_modules ]] || pnpm install --frozen-lockfile --filter @youproof.org/website... > "$3.install.log" 2>&1
export SITE_ENV=staging CONTENT_DIR="$2/content" DEFAULT_LOCALE=hu SITE_HOST=staging.youproof.org WORKER_DOMAIN=staging.youproof.hu
export NEXT_PUBLIC_TURNSTILE_SITEKEY= NEXT_PUBLIC_GA_MEASUREMENT_ID=G-0000000000
rm -rf apps/website/out apps/website/.next
pnpm --filter @youproof.org/website build > "$3.build.log" 2>&1
rm -rf "$3" && cp -R apps/website/out "$3"
echo "built $3"
