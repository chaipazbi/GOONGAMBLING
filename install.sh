#!/usr/bin/env bash
# Installation complète du bot sur une VM Ubuntu/Debian fraîche.
# À lancer DEPUIS le dossier du bot :  bash install.sh
set -euo pipefail

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
UTILISATEUR="$(whoami)"

echo "==> Installation du bot depuis : $DOSSIER (utilisateur : $UTILISATEUR)"

# --- 1. Fichier d'échange (utile sur un droplet 512 Mo) ---
if ! swapon --show | grep -q '/swapfile'; then
  echo "==> Création d'un swap de 1 Go"
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "==> Swap déjà présent, on saute"
fi

# --- 2. Paquets de base ---
echo "==> Mise à jour des paquets"
sudo apt-get update -qq
sudo apt-get install -y -qq curl git unzip ca-certificates

# --- 3. Node.js 20 ---
VERSION_NODE="$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)"
if [ "${VERSION_NODE:-0}" -lt 18 ]; then
  echo "==> Installation de Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node.js $(node --version) déjà installé"
fi

# --- 4. Dépendances du bot ---
echo "==> npm install"
cd "$DOSSIER"
npm install --no-audit --no-fund

# --- 5. Fichier .env ---
if [ ! -f "$DOSSIER/.env" ]; then
  cp "$DOSSIER/.env.example" "$DOSSIER/.env"
  echo "==> .env créé depuis .env.example — IL FAUT LE REMPLIR"
else
  echo "==> .env déjà présent, on n'y touche pas"
fi

# --- 6. Dossier de sauvegardes + tâche quotidienne ---
mkdir -p "$HOME/backups"
LIGNE_CRON="0 4 * * * cp $DOSSIER/data.json $HOME/backups/data-\$(date +\\%F).json"
if ! crontab -l 2>/dev/null | grep -qF "$DOSSIER/data.json"; then
  (crontab -l 2>/dev/null; echo "$LIGNE_CRON") | crontab -
  echo "==> Sauvegarde quotidienne de data.json programmée à 4h (dans ~/backups)"
else
  echo "==> Sauvegarde quotidienne déjà programmée"
fi

# --- 7. Service systemd ---
CHEMIN_NODE="$(command -v node)"
echo "==> Création du service systemd (bot-paris)"
sudo tee /etc/systemd/system/bot-paris.service >/dev/null <<EOF
[Unit]
Description=Bot Discord - Paris personnalises
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$UTILISATEUR
WorkingDirectory=$DOSSIER
ExecStart=$CHEMIN_NODE index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bot-paris >/dev/null

echo
echo "======================================================"
echo " Installation terminée."
echo
echo " Il reste 3 étapes :"
echo "   1) nano .env          (colle DISCORD_TOKEN, CLIENT_ID, GUILD_ID)"
echo "   2) npm run deploy     (enregistre les commandes slash)"
echo "   3) sudo systemctl start bot-paris"
echo
echo " Vérifier ensuite :  systemctl status bot-paris"
echo " Voir les logs    :  journalctl -u bot-paris -f"
echo "======================================================"
