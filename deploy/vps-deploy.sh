#!/usr/bin/env bash
# Nasazení / aktualizace aplikace Log AI rozborů na VPS (spouštět z Macu ve složce projektu):  ./deploy/vps-deploy.sh
# Poprvé: na VPS vytvořit /opt/datec-scandookumentu/.env podle .env.example a přidat blok z deploy/Caddyfile.snippet.
set -e
VPS="${VPS:-root@95.216.201.2}"
KEY="${KEY:-$HOME/.ssh/id_ed25519_jhnapps}"
DIR=/opt/datec-scandookumentu
SSH="ssh -i $KEY -o BatchMode=yes"

cd "$(dirname "$0")/.."
# verze.json: co přesně se nasazuje (commit, větev, čas) – server ji vrací v /api/health
printf '{"commit":"%s","vetev":"%s","nasazeno":"%s"}\n' "$(git rev-parse --short HEAD 2>/dev/null || echo ?)" "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ?)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > verze.json
$SSH "$VPS" "mkdir -p $DIR && chown jhnapps:jhnapps $DIR"
rsync -az -e "$SSH" --exclude node_modules --exclude .git --exclude .DS_Store --exclude .env --exclude .netlify ./ "$VPS:$DIR/"
$SSH "$VPS" "chown -R jhnapps:jhnapps $DIR && su - jhnapps -c 'cd $DIR && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1 && (pm2 restart datec-scandookumentu --update-env 2>/dev/null || pm2 start deploy/ecosystem.config.cjs) && pm2 save && sleep 2 && curl -s localhost:3101/api/health'"
echo
echo "Hotovo. Log: ssh -i $KEY $VPS \"su - jhnapps -c 'pm2 logs datec-scandookumentu --lines 50'\""
