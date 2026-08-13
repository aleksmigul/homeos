#!/bin/bash
set -euo pipefail
cd /root/homeos
pnpm check && pnpm build
release="$(date -u +%Y%m%dT%H%M%SZ)"; backup="/var/backups/homeos/$release"
install -d -o root -g root -m 0700 "$backup"
cp -a /var/lib/homeos/homeos.db "$backup/homeos.db"; cp -a /srv/homeos/apps/api/dist "$backup/api-dist"; cp -a /srv/homeos/apps/web/dist "$backup/web-dist"
git rev-parse HEAD > "$backup/git-revision"
install -d -o root -g root -m 0755 /srv/homeos/apps/api/dist.next /srv/homeos/apps/web/dist.next
cp -a apps/api/dist/. /srv/homeos/apps/api/dist.next/; cp -a apps/web/dist/. /srv/homeos/apps/web/dist.next/
chown -R root:root /srv/homeos/apps/api/dist.next /srv/homeos/apps/web/dist.next
mv /srv/homeos/apps/api/dist /srv/homeos/apps/api/dist.previous; mv /srv/homeos/apps/api/dist.next /srv/homeos/apps/api/dist
mv /srv/homeos/apps/web/dist /srv/homeos/apps/web/dist.previous; mv /srv/homeos/apps/web/dist.next /srv/homeos/apps/web/dist
systemctl restart homeos.service
rm -rf /srv/homeos/apps/api/dist.previous /srv/homeos/apps/web/dist.previous
echo "Deployment completed successfully. Pre-deploy backup: $backup"
