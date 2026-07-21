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

systemctl restart homeos.service
