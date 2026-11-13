#!/bin/bash
set -euo pipefail
cd /root/homeos
pnpm install --frozen-lockfile --prod=false
pnpm check
pnpm build
mkdir -p /root/homeos/.release
prepared=$(mktemp -d /root/homeos/.release/deploy.XXXXXX)
cleanup() { rm -rf -- "$prepared"; }
trap cleanup EXIT
install -d "$prepared/apps/web"
pnpm --filter @homeos/api deploy --prod --legacy "$prepared/apps/api"
cp -a apps/web/dist "$prepared/apps/web/dist"
node scripts/smoke-release.mjs "$prepared"

release="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup="/var/backups/homeos/$release"
install -d -o root -g root -m 0700 "$backup"
git rev-parse HEAD > "$backup/git-revision"
# Stop database writes while taking the pre-deploy snapshot.
systemctl stop homeos.service
if ! cp -a /var/lib/homeos/homeos.db "$backup/homeos.db"; then
    systemctl start homeos.service
    exit 1
fi
previous="/srv/homeos/apps.previous.$release"
rollback() {
    systemctl stop homeos.service || true
    if [ -d "$previous" ]; then
        rm -rf /srv/homeos/apps
        mv "$previous" /srv/homeos/apps
    fi
    systemctl start homeos.service || true
    if systemctl is-enabled --quiet homeos-codex-terminal.service 2>/dev/null; then systemctl restart homeos-codex-terminal.service || true; fi
}
trap 'rollback; cleanup' ERR HUP INT TERM
mv /srv/homeos/apps "$previous"
cp -a "$prepared/apps" /srv/homeos/apps
chown -R root:root /srv/homeos/apps
find /srv/homeos/apps -type d -exec chmod 0755 {} +
find /srv/homeos/apps -type f -exec chmod a+r {} +
systemctl restart homeos.service
if systemctl is-enabled --quiet homeos-codex-terminal.service 2>/dev/null; then systemctl restart homeos-codex-terminal.service; fi
healthy=false
for attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:4000/api/health | /usr/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).ok===true?0:1)}catch{process.exit(1)}})'; then
        healthy=true
        break
    fi
    sleep 1
done
if [ "$healthy" != true ]; then
    echo "Deployment health check failed; restoring the previous application." >&2
    false
fi
trap - ERR HUP INT TERM
echo "Deployment completed successfully. Previous application: $previous; database backup: $backup"
