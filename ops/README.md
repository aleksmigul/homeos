# HomeOS operations

The production application runs from `/srv/homeos`; the mutable database is
stored separately at `/var/lib/homeos/homeos.db`. Do not develop directly in
`/srv/homeos` or run the application as root.

## Deploy

Prepare a release as your normal development user, then activate it with the
small privileged step:

```bash
ops/build-release.sh
sudo ops/deploy.sh
```

The first command installs locked dependencies, checks, builds, and creates the
ignored `.release/` directory. The root step only validates and installs those
artifacts into `/srv/homeos`; it does not execute package lifecycle or build
scripts. The release does not contain `.git`, local environment files, source,
or development-only documentation.
The previous release is retained as a timestamped `/srv/homeos.previous.*`
directory for rollback; remove old releases deliberately after verification.

The system configuration templates are:

- `ops/homeos.service`
- `ops/nginx-homeos.conf`
- `ops/homeos-backup.service` and `ops/homeos-backup.timer`

After changing a template, validate it and deliberately install it under `/etc`.

## Backups

The backup timer creates a compressed daily copy under `/var/backups/homeos` and
retains 14 days. It briefly stops the API so the `sql.js` database cannot be
copied during a whole-file rewrite. These local backups protect against an app
or operator mistake, but not VPS or disk loss. Sync this directory to encrypted
off-server storage.

To restore, stop HomeOS, decompress a selected backup to a temporary file, run
an integrity check, install it as `/var/lib/homeos/homeos.db` owned by
`homeos:homeos` with mode `0600`, then start HomeOS. Keep the current database
until the restored application has been verified.
