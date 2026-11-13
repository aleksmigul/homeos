# HomeOS operations

The production application runs from `/srv/homeos`; the mutable database is
stored separately at `/var/lib/homeos/homeos.db`. Do not develop directly in
`/srv/homeos` or run the application as root.

Production configuration in `/etc/homeos.env` includes Google authentication
and the self-hosted Travel email integration: `TRAVEL_MAIL_PATH` and
`TRAVEL_INBOX_ADDRESS`. Postfix accepts the travel address on TCP port 25 and
queues messages under `/var/lib/homeos/travel-mail` for the API to import.
The alternative Resend integration uses `RESEND_API_KEY` and
`RESEND_WEBHOOK_SECRET` with `email.received` events delivered to
`https://os.theannexation.fun/api/webhooks/resend`.
See [Travel inbox setup](travel-inbox.md) for the account, DNS, configuration,
and end-to-end verification steps.

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

The backup timer creates compressed daily copies of the database and saved-item
attachments under `/var/backups/homeos` and retains 14 days. It briefly stops
the API so the `sql.js` database cannot be copied during a whole-file rewrite.
The attachments archive also includes the local travel-mail queue and original
MIME messages. Postfix is briefly stopped when running to keep that copy stable.
These local backups protect against an app
or operator mistake, but not VPS or disk loss. Sync this directory to encrypted
off-server storage.

To restore, stop HomeOS, decompress a selected backup to a temporary file, run
an integrity check, install it as `/var/lib/homeos/homeos.db` owned by
`homeos:homeos` with mode `0600`, extract the matching attachments archive under
`/var/lib/homeos`, restore uploads ownership to `homeos:homeos` and travel-mail
ownership to `homeos-mail:homeos` (directories `0770`, files `0660`), then start
HomeOS and Postfix. Keep
the current database and uploads until the restored application has been verified.

The in-app Deploy action uses `scripts/deploy-homeos.sh`. It packages the API
with all production dependencies (including the current shared workspace package),
then starts the packaged API against a temporary database and checks `/api/health`
before changing the running app. Both deployment paths check live health after
restart and restore the previous application on failure. Previous application
files are retained for rollback. Database migrations are not automatically reverted.
Release builds explicitly install development dependencies before checking and
compiling, including when the worker has `NODE_ENV=production`. Automatic pnpm
installs before scripts are disabled so checks cannot silently prune those tools.
The smoke check creates and removes its temporary database inside the release.
Run the packaged startup regression check manually with:

```bash
node scripts/smoke-release.mjs /path/to/release
```

## Interactive Codex Terminal

The **Codex Terminal** module at `/codex-terminal` is separate from the existing
queued **Dev** module. It runs the installed interactive Codex CLI in a dedicated
tmux server. xterm.js carries the actual terminal over an authenticated WebSocket;
slash commands, approvals, keyboard input and interrupts go directly to Codex.
New sessions use `/root/homeos`, the server's existing Codex login/configuration,
`workspace-write` sandboxing and `on-request` approvals. No approval bypass is set.
The API does not receive the Codex login credentials or run as root.

After deploying a release containing the bridge, configure it once:

```bash
sudo ops/configure-codex-terminal.sh
```

This installs `homeos-codex-terminal.service` and adds a validated WebSocket
location to nginx, preserving the site's other settings. It requires the existing
`homeos` group plus `tmux`, `python3`, Node and `/root/.local/bin/codex`. The bridge
runs as the same root development identity as the existing Codex worker, with
write access limited by systemd to the development checkout, Codex state and its
runtime directory. It listens only on `/run/homeos-codex/bridge.sock` (root:homeos,
0660); the main API remains unprivileged. HTTP and WebSocket requests require the
developer account, and the WebSocket must have a matching Origin. Terminal APIs
are excluded from service-worker offline caching.

The tmux socket is separate and root-only. Closing a browser or restarting the API
or bridge detaches its terminal client; it does not end Codex. The service's
`KillMode=process` and preserved runtime directory deliberately retain tmux across
bridge restarts. A host reboot ends running processes. Use **End session** to
stop a session explicitly; up to four sessions can exist. The session selector
restores the last selection on this browser. The composer and Esc, Tab, arrow,
Enter and Ctrl+C buttons support phones; direct terminal input is also available.

Both deployment scripts restart the bridge when its unit is enabled. Useful
checks are `systemctl status homeos-codex-terminal`,
`journalctl -u homeos-codex-terminal`, and (as root):

```bash
curl --unix-socket /run/homeos-codex/bridge.sock http://localhost/sessions
tmux -S /run/homeos-codex/tmux.sock list-sessions
```

`apps/api/src/codexTerminal.test.ts` exercises a real isolated tmux server and PTY,
including stream forwarding, resize, Ctrl+C, reconnects, bridge replacement,
limits and access/origin checks. Browser tests in `codex-terminal.spec.ts` exercise
the module with a simulated WebSocket peer, without spending Codex tokens.
