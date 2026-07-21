#!/bin/sh
set -eu

backup_dir=/var/backups/homeos
database=/var/lib/homeos/homeos.db
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$backup_dir/.homeos-$stamp.db.gz.tmp"
destination="$backup_dir/homeos-$stamp.db.gz"

install -d -o root -g root -m 0700 "$backup_dir"

restart_homeos() {
    rm -f "$temporary"
    systemctl start homeos.service
}

trap restart_homeos EXIT HUP INT TERM
systemctl stop homeos.service
gzip -c "$database" > "$temporary"
chmod 0600 "$temporary"
mv "$temporary" "$destination"
find "$backup_dir" -type f -name 'homeos-*.db.gz' -mtime +14 -delete
trap - EXIT HUP INT TERM
systemctl start homeos.service
