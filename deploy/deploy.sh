#!/usr/bin/env bash
# Deploys the current build of Property Listing New to Hostinger.
# Run from the project root after `npm run build`:
#   bash deploy/deploy.sh
set -euo pipefail

HOST="root@listings.srv1802669.hstgr.cloud"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
APP="/opt/a7-listing-v2"
SSH="ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $KEY $HOST"

echo "== backup on server"
$SSH "mkdir -p $APP/backup && cd $APP && tar czf backup/pre-\$(date +%Y%m%d-%H%M%S).tgz server client/dist package.json"

echo "== upload"
tar czf - server client/dist package.json package-lock.json | $SSH "cd $APP && rm -rf client/dist && tar xzf -"

echo "== install + restart"
$SSH "cd $APP && npm install --omit=dev --no-audit --no-fund | tail -1 && systemctl restart a7-listing-v2 && sleep 3 && systemctl is-active a7-listing-v2 && curl -s http://127.0.0.1:8844/healthz && echo"

echo "== public checks"
curl -s -o /dev/null -w "healthz %{http_code}\n" https://listings.srv1802669.hstgr.cloud/healthz
curl -s -o /dev/null -w "feed pf %{http_code}\n" https://listings.srv1802669.hstgr.cloud/feeds/pf.xml
curl -s -o /dev/null -w "api without login %{http_code} (403 expected)\n" https://listings.srv1802669.hstgr.cloud/api/listings
