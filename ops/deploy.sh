#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this deployment script with sudo." >&2
    exit 1
fi

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
prepared="$repo/.release"
cd "$repo"

if [ ! -d "$prepared/apps/api/dist" ] || [ ! -d "$prepared/apps/api/node_modules" ] || [ ! -d "$prepared/apps/web/dist" ]; then
    echo "No prepared release found. Run ops/build-release.sh without sudo first." >&2
    exit 1
fi

node "$repo/scripts/smoke-release.mjs" "$prepared"

stage=$(mktemp -d /srv/homeos.next.XXXXXX)
release=/srv/homeos.previous.$(date -u +%Y%m%dT%H%M%SZ)
cleanup() {
    if [ -d "$stage" ]; then
        rm -rf -- "$stage"
    fi
}
trap cleanup EXIT HUP INT TERM

cp -a "$prepared/." "$stage/"
chown -R root:root "$stage"
find "$stage" -type d -exec chmod 0755 {} +
find "$stage" -type f -exec chmod u=rw,go=r {} +

if [ -e /srv/homeos ]; then
    mv /srv/homeos "$release"
fi
mv "$stage" /srv/homeos
trap - EXIT HUP INT TERM

healthy=false
if systemctl restart homeos.service && { ! systemctl is-enabled --quiet homeos-codex-terminal.service 2>/dev/null || systemctl restart homeos-codex-terminal.service; }; then
    for attempt in $(seq 1 30); do
        if curl --fail --silent --max-time 2 http://127.0.0.1:4000/api/health | /usr/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).ok===true?0:1)}catch{process.exit(1)}})'; then
            healthy=true
            break
        fi
        sleep 1
    done
fi
if [ "$healthy" != true ]; then
    systemctl stop homeos.service || true
    mv /srv/homeos "/srv/homeos.failed.$(date -u +%Y%m%dT%H%M%SZ)"
    if [ -d "$release" ]; then
        mv "$release" /srv/homeos
        systemctl start homeos.service
        if systemctl is-enabled --quiet homeos-codex-terminal.service 2>/dev/null; then systemctl restart homeos-codex-terminal.service; fi
    fi
    echo "Deployment failed its health check; previous release restored when available." >&2
    exit 1
fi
