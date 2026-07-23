# 🎲 Bot Discord — Paris personnalisés (v3)

Paris entre amis avec monnaie virtuelle, **cotes en direct**, **niveaux/XP** et
**statistiques**. Les mises se font en un clic via des boutons. Tout est stocké
dans un simple `data.json`.

## ✨ Commandes

| Commande | Effet |
|---|---|
| `/pari creer <titre> <issue_1> <issue_2> …` | Crée un pari (jusqu'à 20 issues) |
| `/pari liste` | Paris en cours |
| `/solde [membre]` | Solde |
| `/daily` | Récompense quotidienne (**+XP**) |
| `/daily auto:09:00` | Collecte automatique tous les jours à 9h (XP réduite) |
| `/daily auto:off` | Désactive la collecte auto |
| `/donner <membre> <montant>` | Transfert |
| `/stats [membre]` | Niveau, XP, ratio V/D, pièces misées/gagnées/perdues |
| `/classement [type]` | Top pièces (défaut) ou top niveau |
| `/eco ajouter\|retirer\|definir` | Gestion admin des soldes |
| `/xp ajouter\|retirer\|definir` | Gestion admin de l'expérience |

## 🎛️ Boutons sur un pari
- **Un bouton par issue** (avec sa cote) → clic → saisie du montant
  (accepte aussi `all` pour tout miser)
- **🔒 Verrouiller** — stoppe les mises
- **🏆 Clôturer** — choisit l'issue gagnante et paie
- **✏️ Corriger le résultat** — apparaît après la clôture : **reprend
  intégralement** les gains, l'XP et les stats versés, puis repaie sur la bonne
  issue
- **🔄 Rembourser** — annule et rend toutes les mises (fonctionne même après
  clôture)

Réservé au créateur du pari ou à un membre avec « Gérer le serveur ».

## 💰 Cotes
À la création, la maison pose **100 sur chaque issue** (`BET_SEED`). La cote
d'une issue = cagnotte totale ÷ cagnotte de l'issue.

- 2 issues → cote de départ **2.00** (200 ÷ 100). Avec 3 issues, ce sera 3.00.
- Les mises font **baisser** la cote de leur issue et **monter** celle des autres.
- Au paiement : mise × (cagnotte totale ÷ cagnotte gagnante).
- Personne sur l'issue gagnante → tout le monde est remboursé.

> La mise de la maison enrichit légèrement la cagnotte : c'est de l'argent
> offert aux gagnants, donc la masse monétaire augmente doucement au fil des
> paris. C'est voulu (ça récompense les parieurs), et `/eco` permet de corriger
> si besoin.

## 🏅 Niveaux et XP
- `/daily` **manuel** : +50 XP · collecte **auto** : +25 XP
- Pari gagné : +25 XP, plus 1 XP par tranche de 10 pièces de gain net
- Paliers : niveau 2 à 100 XP, 3 à 300, 4 à 600, 5 à 1000… (+100 par palier)

Tout est réglable dans `.env` (`XP_DAILY`, `XP_DAILY_AUTO`, `XP_BET_WIN`, `XP_PER_COINS`).
Un admin peut ajuster l'XP d'un membre avec `/xp`.

## 📊 Statistiques (`/stats`)
Paris joués / gagnés / perdus, **ratio V/D** et taux de victoire, total misé,
pièces gagnées et perdues, bilan net, solde, état de la collecte auto.

---

## 🚀 Installation

```bash
npm install
cp .env.example .env    # puis remplis DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm run deploy          # ⚠️ obligatoire en v3 : les commandes ont changé
npm start
```

## 🔄 Mise à jour depuis la v2

Les données existantes sont **migrées automatiquement** au premier lancement :
soldes et paris conservés, XP et statistiques initialisés à zéro.

Les paris **déjà ouverts** gardent leur mise maison à 0 : leurs cotes ne
changent pas en cours de route. Seuls les nouveaux paris sont amorcés à 100.

Sur la VM :
```bash
cd ~/GOONSOCIETY
cp data.json data.backup-$(date +%F).json   # sauvegarde d'abord !
git pull
npm install
npm run deploy
sudo systemctl restart bot-paris
```

## 🗂️ Structure
| Fichier | Rôle |
|---|---|
| `index.js` | Client Discord, routage des commandes/boutons |
| `commands.js` | Définition des commandes slash |
| `deploy-commands.js` | Script de déploiement |
| `config.js` | Configuration (`.env`) |
| `store.js` | Lecture/écriture de `data.json` + migration |
| `economy.js` | Soldes, transferts, daily |
| `levels.js` | XP, niveaux, classements |
| `bets.js` | Paris, cotes, clôture, correction |
| `ui.js` | Embeds et boutons |
| `scheduler.js` | Collecte automatique du daily |

## ⚠️ Notes
- Sauvegarde `data.json` régulièrement.
- Ne partage jamais ton `.env` ni ton token.
