#!/bin/sh
set -eu

backup_dir=/var/backups/homeos
database=/var/lib/homeos/homeos.db
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$backup_dir/.homeos-$stamp.db.gz.tmp"
destination="$backup_dir/homeos-$stamp.db.gz"
attachments_temporary="$backup_dir/.homeos-attachments-$stamp.tar.gz.tmp"
attachments_destination="$backup_dir/homeos-attachments-$stamp.tar.gz"

install -d -o root -g root -m 0700 "$backup_dir"

restart_homeos() {
    rm -f "$temporary" "$attachments_temporary"
    systemctl start homeos.service
}

trap restart_homeos EXIT HUP INT TERM
systemctl stop homeos.service
gzip -c "$database" > "$temporary"
install -d -o homeos -g homeos -m 0700 /var/lib/homeos/uploads
tar -C /var/lib/homeos -czf "$attachments_temporary" uploads
chmod 0600 "$temporary" "$attachments_temporary"
mv "$temporary" "$destination"
mv "$attachments_temporary" "$attachments_destination"
find "$backup_dir" -type f -name 'homeos-*.db.gz' -mtime +14 -delete
find "$backup_dir" -type f -name 'homeos-attachments-*.tar.gz' -mtime +14 -delete
trap - EXIT HUP INT TERM
systemctl start homeos.service
