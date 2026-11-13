# Travel inbox setup

The app stores received messages in the shared Travel inbox. The self-hosted
receiver is described below; the original Resend webhook remains optional. Repeated delivery of the
same provider email is deduplicated. It accepts only recipients matching
`TRAVEL_INBOX_ADDRESS`.

## Self-hosted receiving (production default)

Mail is received directly on the VPS using Postfix. An unprivileged
`homeos-mail` account parses MIME messages with Python's standard library,
archives the original `.eml`, and atomically queues parsed JSON. The API polls
that queue every five seconds and remains the sole database writer. Imported
JSON is removed only after persistence; original messages are retained.

Production settings:

```dotenv
TRAVEL_MAIL_PATH=/var/lib/homeos/travel-mail
TRAVEL_INBOX_ADDRESS=travel@os.theannexation.fun
```

To reproduce the mail-service setup on this VPS, install Postfix and run
`sh ops/configure-travel-postfix.sh` as root. It requires the existing `homeos`
account and Let's Encrypt certificate for `os.theannexation.fun`. This script
configures a dedicated receiving-only instance; it replaces Postfix routing
settings and should not be used on a host with another mail-service role.
Deploy the API importer, set the environment above, and restart HomeOS.
The script allows port 25 through UFW and adds a certificate-renewal hook.
Only `travel@os.theannexation.fun` is accepted. Other addresses and external
relay destinations are rejected, including for local SMTP clients. The message
limit is 25 MiB. Resend credentials are unnecessary for this setup.

### hPanel changes

In the DNS zone for `theannexation.fun`, add:

| Type | Name | Target | Priority | TTL |
| --- | --- | --- | --- | --- |
| MX | `os` | `os.theannexation.fun` | `10` | `300` |

The existing A record for `os` already points to `177.7.52.249`; keep it.
The MX target must be a hostname. No new root-domain MX record is needed.
If a managed Hostinger firewall is attached to the VPS, add an inbound allow
rule for TCP port 25 from any source. Keep the existing SSH/HTTP/HTTPS rules.
Hostinger says it does not block SMTP port 25:
[Hostinger SMTP policy](https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/).

Once DNS propagates, forward a confirmation to the travel address and open
Travel → Inbox. A local setup-test message verifies SMTP → parser → API → DB;
a message from an external mailbox verifies public routing as well.

For troubleshooting, use `journalctl -u postfix -u homeos`, `postqueue -p`, and
inspect `/var/lib/homeos/travel-mail/new` (pending) and `raw` (originals).
A parser failure makes Postfix retain and retry delivery; an import failure
leaves the JSON queued. Backups include the travel-mail directory. Messages
and attachments remain on this VPS and its configured backup storage.

## Alternative: Resend receiving

1. In Resend, add and verify `os.theannexation.fun`, enable receiving, and copy
   the DNS records shown for that domain. Add the receiving MX record at the
   `os` hostname in the DNS zone for `theannexation.fun`. Use the exact target
   and priority Resend supplies. Keep the website's existing A/AAAA records.
   Alternatively, use `travel@<your-account-id>.resend.app` from Resend's Emails
   → Receiving → Receiving address menu, which needs no custom DNS changes.
2. Create a Resend API key with permission to retrieve received emails.
3. Create an enabled webhook for `email.received` at
   `https://os.theannexation.fun/api/webhooks/resend`. Copy its signing secret.
4. Set these values in `/etc/homeos.env` on the production host, preserving all
   other configuration. Keep secrets out of source control and chat:

   ```dotenv
   RESEND_API_KEY=<your API key>
   RESEND_WEBHOOK_SECRET=<this webhook's signing secret>
   TRAVEL_INBOX_ADDRESS=travel@os.theannexation.fun
   ```

   If using the Resend-managed address, set `TRAVEL_INBOX_ADDRESS` to that exact
   address instead. Restart `homeos.service` after updating the environment.
   The deployed app already has the receiving endpoint; configuration alone
   activates it when all three values are supplied explicitly.

## Verify delivery

1. Confirm Resend reports the receiving domain as ready.
2. Forward a real travel confirmation to the configured address.
3. Check that it appears in Resend's Receiving dashboard and that the matching
   webhook delivery returns HTTP 204.
4. Open Travel → Inbox in the app and check the sender, subject, and body.
5. Replay the same webhook from Resend and confirm only one inbox entry exists.

An unsigned POST should return 400 when the secrets are configured; 503 means
one or both secrets are missing. The inbox's “Live” label checks only for
nonempty secrets, so it does not establish that DNS or delivery works.
If mail appears in Resend but not the app, check the event's recipient against
`TRAVEL_INBOX_ADDRESS`, webhook delivery results, and `journalctl -u homeos`.

## Current scope

Forwarding is manual. The app does not connect to Gmail or automatically scan
an existing mailbox, extract itinerary details, or import historical mail.
Each trip shows messages whose subject or readable body mentions a date within
its inclusive date range. Supported formats include ISO dates, month/day/year
numeric dates with four-digit years, English month names, and same-month ranges
such as `October 10–12, 2026`. Yearless month-name dates use the trip's year(s).
Arrival timestamps and common forwarded Date/Sent header lines are excluded.
Matching is recomputed on read and can show an email on overlapping trips.
It is a basic date heuristic, so unrelated dates can still produce matches.
Attachment names and sizes are stored; attachment
contents are not downloaded and cannot currently be opened from the inbox.

## Provider documentation

- [Receiving emails](https://resend.com/docs/dashboard/receiving/introduction)
- [Custom receiving domains](https://resend.com/docs/dashboard/receiving/custom-domains)
- [Webhooks](https://resend.com/docs/webhooks/introduction)
