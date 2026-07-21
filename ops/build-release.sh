#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
    echo "Build releases as your normal development user, not root." >&2
    exit 1
fi

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
release="$repo/.release"

cd "$repo"
pnpm install --frozen-lockfile
pnpm check
pnpm build

rm -rf -- "$release"
install -d -m 0755 "$release/apps" "$release/apps/web"
pnpm --filter @homeos/api deploy --prod --legacy "$release/apps/api"
rm -rf -- "$release/apps/api/src"
rm -f -- "$release/apps/api/tsconfig.json"
cp -a apps/web/dist "$release/apps/web/dist"

echo "Prepared $release"
echo "Activate it with: sudo ops/deploy.sh"
