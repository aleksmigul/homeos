#!/bin/sh
# Configure a dedicated receiving-only Postfix instance for the Travel inbox.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Run as root" >&2; exit 1; }
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
command -v postconf >/dev/null

getent passwd homeos-mail >/dev/null || useradd --system --gid homeos --home-dir /var/lib/homeos/travel-mail --shell /usr/sbin/nologin homeos-mail
install -d -o homeos-mail -g homeos -m 0770 /var/lib/homeos/travel-mail /var/lib/homeos/travel-mail/new /var/lib/homeos/travel-mail/raw
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "$repo/ops/receive-travel-mail.py" /usr/local/libexec/homeos-receive-travel-mail

postconf -e 'myhostname = os.theannexation.fun'
postconf -e 'inet_interfaces = all'
postconf -e 'inet_protocols = ipv4'
postconf -e 'mydestination ='
postconf -e 'relay_domains = os.theannexation.fun'
postconf -e 'relay_recipient_maps = hash:/etc/postfix/travel_recipients'
postconf -e 'relay_transport = travelpipe'
postconf -e 'recipient_delimiter ='
postconf -e 'smtpd_relay_restrictions = reject_unauth_destination'
postconf -e 'smtpd_recipient_restrictions = reject_non_fqdn_recipient, reject_unknown_recipient_domain, reject_unlisted_recipient'
postconf -e 'smtpd_sasl_auth_enable = no'
postconf -e 'disable_vrfy_command = yes'
postconf -e 'default_transport = error:5.7.1 Outbound mail is disabled on this receiving-only server'
postconf -e 'message_size_limit = 26214400'
postconf -e 'smtpd_client_connection_rate_limit = 30'
postconf -e 'smtpd_client_message_rate_limit = 60'
postconf -e 'travelpipe_destination_recipient_limit = 1'
postconf -e 'smtpd_tls_security_level = may'
postconf -e 'smtpd_tls_cert_file = /etc/letsencrypt/live/os.theannexation.fun/fullchain.pem'
postconf -e 'smtpd_tls_key_file = /etc/letsencrypt/live/os.theannexation.fun/privkey.pem'
printf '%s\n' 'travel@os.theannexation.fun OK' > /etc/postfix/travel_recipients
postmap /etc/postfix/travel_recipients
postconf -M 'travelpipe/unix=travelpipe unix - n n - 2 pipe user=homeos-mail:homeos argv=/usr/bin/python3 /usr/local/libexec/homeos-receive-travel-mail /var/lib/homeos/travel-mail ${recipient}'

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' 'systemctl reload postfix' > /etc/letsencrypt/renewal-hooks/deploy/homeos-postfix
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/homeos-postfix
postfix check
systemctl enable postfix
systemctl restart postfix
ufw allow 25/tcp comment 'Travel inbox SMTP'
