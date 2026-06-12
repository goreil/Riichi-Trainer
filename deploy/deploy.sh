#!/usr/bin/env bash
# Deploy trainer-haipai.ylue.de: nginx vhost + Let's Encrypt cert.
# Run as root:  sudo bash /opt/Riichi-Trainer/deploy/deploy.sh
set -euo pipefail

DOMAIN="trainer-haipai.ylue.de"
SRC="/opt/Riichi-Trainer/deploy/trainer-haipai.conf"
AVAIL="/etc/nginx/sites-available/trainer-haipai.conf"
ENABLED="/etc/nginx/sites-enabled/trainer-haipai.conf"
WEBROOT="/var/lib/letsencrypt"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo/root." >&2; exit 1; fi

echo "==> 1/4  Installing temporary HTTP-only vhost (for ACME challenge)"
cat > "$AVAIL" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 404; }
}
EOF
ln -sfn "$AVAIL" "$ENABLED"
nginx -t
systemctl reload nginx

echo "==> 2/4  Requesting certificate via webroot"
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    echo "    Certificate already exists, skipping issuance."
else
    certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
        --key-type ecdsa --non-interactive --agree-tos
fi

echo "==> 3/4  Installing final vhost (HTTPS + static SPA)"
cp "$SRC" "$AVAIL"
nginx -t

echo "==> 4/4  Reloading nginx"
systemctl reload nginx

echo "Done. https://${DOMAIN}/ should now be live."
