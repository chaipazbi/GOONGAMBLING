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
| `/daily` | Récompense quotidienne (**+XP**) — une fois par jour |
| `/daily auto:09:00` | Collecte automatique tous les jours à 9h (XP réduite) |
| `/daily auto:off` | Désactive la collecte auto |
| `/donner <membre> <montant>` | Transfert |
| `/stats [membre]` | Niveau, XP, ratio V/D, pièces misées/gagnées/perdues |
| `/classement [type]` | Top pièces (défaut) ou top niveau |
| `/boutique` | Boutique du jour : 3 caisses à acheter |
| `/inventaire [membre]` | Voir/ouvrir ses caisses |
| `/caisses` | Probabilités de chaque caisse |
| `/caisse donner\|retirer` | Donner/retirer des caisses (admin) |
| `/refresh-boutique [membre]` | Renouveler la boutique (admin) |
| `/serveurs` | Liste les serveurs du bot (propriétaire, via `OWNER_ID`) |
| `/slots` | Machine à sous (RTP ~108 %, gagnant joueur) |
| `/objets` | Potions ×2 et retour arrière (boutique + inventaire) |
| `/missions` | Missions du jour (3/jour, pièces + XP) |
| `/blackjack` | Blackjack contre le croupier |
| `/roulette` | Table de roulette (multijoueur) |
| `/course-de-cheval` | Course de 4 chevaux (multijoueur) |
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
pièces gagnées et perdues, bilan net. **Caisses** : ouvertes, dépensé/gagné,
XP gagnée, bilan. Plus l'**inventaire**, le solde et l'état de la collecte auto.

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
| `time.js` | Date/heure locales (fuseau configuré) |
| `shop.js` | Boutique quotidienne et ouverture des caisses |

## 🌍 Utilisation sur plusieurs serveurs

Chaque serveur a son **économie totalement séparée** : soldes, XP, statistiques
et numérotation des paris repartent de zéro sur un nouveau serveur. Personne ne
peut transporter ses pièces d'un serveur à l'autre, et un admin d'un autre
serveur ne peut pas influencer le tien.

Pour ouvrir le bot à d'autres serveurs :
1. Vider la ligne `GUILD_ID=` dans `.env` (garde `MAIN_GUILD_ID` renseigné).
2. `npm run deploy` — les commandes deviennent globales (jusqu'à 1h de
   propagation la première fois).
3. Developer Portal → onglet **Bot** → activer **Public Bot**.
4. Partager le lien OAuth2 (scopes `bot` + `applications.commands`).

> À partir de **100 serveurs**, Discord impose une vérification du bot.
> Et si l'usage grossit beaucoup, il faudra passer de `data.json` à SQLite.

## 🛒 Boutique et caisses

`/boutique` propose **3 caisses par jour** (par joueur), renouvelées chaque jour
à 00h00. Plus une caisse est rare, moins elle apparaît. Cinq raretés :

| Caisse | Prix | Apparition |
|---|---|---|
| ⚪ Commune | 750 | 45 % |
| 🔵 Rare | 1250 | 27 % |
| 🟣 Épique | 2000 | 15 % |
| 🟡 Légendaire | 2500 | 9 % |
| 🔴 Mythique | 3000 | 4 % |

Les caisses achetées vont dans l'**inventaire** (`/inventaire`), où on les ouvre
quand on veut. **Le résultat d'une ouverture est public** dans le salon.
`/caisses` affiche la table complète des probabilités.

À l'ouverture : **rien** dégressif selon la rareté (Commune 20 % → Mythique 0 %),
puis pièces (×0.85 à ×1.70), remboursement, caisse supérieure et gains d'XP.
Plus la caisse est rare, plus elle rapporte.

> ⚖️ **Rendement moyen** : Commune ~82 %, Rare ~85 %, Épique ~86 %,
> Légendaire ~90 %, Mythique ~105 % (la seule rentable). Réglable via
> `CRATE_RIEN` et `CRATE_REWARDS` dans `config.js`.

Un admin peut distribuer des caisses (giveaways) avec
`/caisse donner @membre <rareté> <nombre>`, et en retirer avec `/caisse retirer`.

## 🎰 Mini-jeux

Chaque jeu s'ouvre par un menu (bouton **Jouer** + bouton **Cotes/Probabilités**).
Fichiers : `cards.js`, `blackjack.js`, `roulette.js`, `horserace.js`, `casino-ui.js`.
Les parties en cours vivent en mémoire (perdues si le bot redémarre en pleine partie).

- **`/blackjack`** — deux modes :
  - **Table privée** : contre le croupier (bot). Victoire × multiplicateur
    aléatoire **2.10–2.90** (RTP ~113 %), égalité = mise rendue, défaite = perdue.
    Tirer / Rester / Doubler. Plusieurs parties privées en parallèle.
  - **Table publique (JcJ)** : plusieurs joueurs, même mise d'entrée, chacun
    joue sa main, le plus proche de 21 sans dépasser rafle la cagnotte (égalité
    = partage, tous sautés = remboursés). Redistribution pure entre joueurs.
- **`/roulette`** — table publique, chacun mise (type + montant, ou `plein` +
  numéro), puis le créateur lance la roue. Roue européenne 37 cases, vraies
  cotes + **bonus joueur** (`ROULETTE_BONUS`, défaut 1.10 → RTP ~107 %).
- **`/course-de-cheval`** — 4 chevaux (noms Umamusume), cotes affichées, table
  publique, gain = mise × cote. Favoris marqués (cote ~1.3–2.5, gagnent souvent
  mais paient peu) et outsiders (jusqu'à ~15, rares mais gros gain). `HORSE_EDGE`
  réglable (défaut **-0.08** = +8 % joueurs) ; `PROB_MIN` borne les grosses cotes.

> ⚖️ Seule la roulette garde un avantage maison. Blackjack (+8 %) et course
> (+3 %) sont volontairement à l'avantage des joueurs : ils injectent donc un
> peu de pièces. La source principale reste le `/daily`.

## ⚠️ Notes
- Sauvegarde `data.json` régulièrement.
- Ne partage jamais ton `.env` ni ton token.

## Objets, missions, niveaux (v9)

- **Machine à sous** `/slots` — 3 rouleaux, RTP ~108 %. Gains fréquents (2 symboles)
  et jackpots rares (3 symboles, 🎰 = ×60).
- **Objets** `/objets` — achetables en boutique + **drop** sur les victoires :
  - 🧪 **Potion ×2 pièces** (2000) — double le **bénéfice net** du prochain gain (tous jeux + paris). Drop ~1 %.
  - 📗 **Potion ×2 XP** (1000) — double l'XP du prochain pari gagné. Drop ~2 %.
  - ⏪ **Retour arrière** (5000) — rembourse la mise de ta dernière perte. Drop ~0,5 %.
  On **arme** une potion, elle se consomme au prochain gain. Pas de plafond.
- **Missions quotidiennes** `/missions` — 3 par jour (reset minuit). Objectif **tiré
  au hasard** dans une fourchette, récompense **proportionnelle** à l'objectif.
  Bouton « Voir toutes les quêtes possibles » pour afficher le catalogue complet.
- **Bonus de niveau** — à chaque niveau atteint, prime = niveau × 200 pièces (une fois).

> ⚠️ Réglages dans `items.js` (prix, taux de drop), `slots.js` (symboles/gains),
> `missions.js` (catalogue/récompenses), `levels.js` (`LEVEL_BONUS_PER`).
