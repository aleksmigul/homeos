#!/bin/bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run as root." >&2; exit 1; fi
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
for command in tmux python3 node nginx systemctl; do command -v "$command" >/dev/null; done
if [ ! -f /srv/homeos/apps/api/dist/codexTerminalBridge.js ]; then echo "Deploy the release before configuring the terminal service." >&2; exit 1; fi
systemd-analyze verify "$repo/ops/homeos-codex-terminal.service"
# Add only the new WebSocket location; retain the site's existing TLS and headers.
python3 - "$repo" <<'PY'
import pathlib,sys,datetime,subprocess
repo=pathlib.Path(sys.argv[1])
target=pathlib.Path('/etc/nginx/sites-available/homeos')
original=target.read_text()
marker='    location ~ ^/api/dev/terminal/'
updated=original
if marker not in original:
    template=(repo/'ops/nginx-homeos.conf').read_text()
    start=template.index(marker)
    end=template.index('    }',start)+len('    }\n\n')
    anchor='    location /api/ {\n'
    if original.count(anchor)!=1: raise SystemExit('Cannot locate the API proxy block; nginx configuration was not changed.')
    updated=original.replace(anchor,template[start:end]+anchor)
if updated!=original:
    backup=target.with_name(target.name+'.before-codex-terminal.'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.write_text(original)
    target.write_text(updated)
    if subprocess.run(['nginx','-t']).returncode:
        target.write_text(original)
        raise SystemExit('Nginx validation failed; previous configuration restored.')
PY
install -m 0644 "$repo/ops/homeos-codex-terminal.service" /etc/systemd/system/homeos-codex-terminal.service
systemctl daemon-reload
systemctl enable --now homeos-codex-terminal.service
ready=false
for attempt in $(seq 1 20); do
    if curl --fail --silent --unix-socket /run/homeos-codex/bridge.sock http://localhost/sessions --output /dev/null; then ready=true; break; fi
    sleep 1
done
if [ "$ready" != true ]; then echo "Terminal bridge did not become ready. Inspect its service log." >&2; exit 1; fi
nginx -t
systemctl reload nginx
echo "Codex Terminal bridge and WebSocket proxy are ready."
