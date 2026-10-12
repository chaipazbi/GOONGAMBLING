# Mise à jour casino et boutique

## Changements

- Mise maximale par tirage : 50 000 pièces par défaut. Le plafond configuré
  dans MAX_MISE_CASINO reste prioritaire ; mettre cette variable à 50000.
- Slots, roulette, courses : nombre de tirages de 1 à 100 dans le formulaire
  de mise. Champ vide = 1. « 5K » vaut 5000 ; « all » répartit le solde sur
  toute la série sans dépasser le plafond par tirage.
- La série est intégralement débitée avant de commencer. Les gains futurs ne
  servent pas à financer les tirages suivants. Exemple : 5000 × 10 = 50000
  nécessaires, sinon aucun tirage ni débit.
- Blackjack : décisions manuelles conservées, pas de série automatique.
  Le bouton Doubler refuse de dépasser le plafond total de la partie.
- Roulette : toutes les mises du même tour partagent le numéro sorti. Chaque
  entrée participe seulement aux N tours payés. Même principe pour les courses,
  avec les mêmes chevaux et cotes pendant la série.
- Gains, bonus pièces, drops, XP, statistiques et missions sont traités à chaque
  tour comme auparavant. La potion pièces est consommée au premier bénéfice
  positif ; elle ne double pas toute la série. Le Retour arrière concerne
  seulement la dernière perte enregistrée, pas le coût complet de la série.
  La potion XP conserve sa fonction actuelle sur les paris gagnés.
- Un récapitulatif est envoyé. Le détail des séries longues de slots (plus de
  15 tirages) et des séries roulette/chevaux est dans un fichier joint.
- /boutique réunit achats de caisses et objets. /inventaire réunit caisses,
  utilisation des objets et effets actifs. /objets est retirée du déploiement.
- Bouton « Renouveler les caisses · 5K » dans /boutique : paiement de 5000,
  trois nouveaux emplacements achetables. Peut tirer les mêmes raretés.
  Les caisses détenues, objets et limites d'achat quotidiennes sont conservés.
  Le renouvellement ne réinitialise pas l'achat quotidien du Retour arrière.
  Les anciens boutons de caisses sont invalidés par la révision de boutique,
  pour éviter un achat ou renouvellement à partir d'un affichage périmé.

Les probabilités, multiplicateurs, prix d'objets et récompenses quotidiennes
n'ont pas été modifiés. Les fonctions tracker, protection, logs et rôles restent
présentes dans le ZIP. Comme auparavant, ne pas redémarrer au milieu des lobbies
casino : les mises en attente sont liées aux parties en mémoire.

## Installation GitHub / DigitalOcean

Remplacer : index.js, config.js, commands.js, ui.js, extra-ui.js, casino-ui.js,
README.md et .env.example. Ne pas remplacer le .env du serveur par .env.example.

Ajouter : casino-series.js, shop-refresh.js, CASINO-BOUTIQUE.md,
tests/casino-series.test.js, tests/casino-shop-ui.test.js, tests/shop-refresh.test.js.
Si la version protection précédente n'est pas installée, utiliser aussi ses
fichiers indiqués dans PROTECTION-ET-LOGS.md. Ne pas écraser data.json ni .env.

Après avoir mis les fichiers sur GitHub, attendre la fin des parties et lobbies.
Exécuter dans l'ordre et s'arrêter si une étape échoue :

    cd ~/GOONGAMBLING
    mkdir -p ~/backups
    systemctl stop bot-paris
    tar -czf ~/backups/avant-casino-series-$(date +%Y%m%d-%H%M%S).tgz data.json .env
    git pull --ff-only
    sed -i 's/^MAX_MISE_CASINO=.*/MAX_MISE_CASINO=50000/' .env
    npm ci
    node --test tests/*.test.js
    npm run deploy
    systemctl start bot-paris
    systemctl status bot-paris --no-pager
    journalctl -u bot-paris -n 50 --no-pager

Si MAX_MISE_CASINO n'existait pas dans .env, le défaut de 50000 s'applique.
npm run deploy retire /objets du périmètre de commandes configuré pour le bot
(serveur GUILD_ID ou global). Si des commandes avaient été déployées dans les
deux périmètres, l'ancienne commande peut subsister dans celui non mis à jour.
Relancer /boutique après le déploiement, les anciens boutons ne seront plus valides.

## Avis sur l'équilibrage actuel

Calculs tirés du code et de ses paramètres par défaut ; le .env du droplet peut
avoir d'autres valeurs. « Rendement » = total rendu, mise comprise, divisé par
la mise. Les chiffres ci-dessous excluent potions, drops, missions et pièces de
montée de niveau. Ils décrivent une moyenne à long terme, pas une garantie.

| Jeu | Rendement moyen de base | Lecture |
| --- | --- | --- |
| Slots | 107,57 % | Environ +7,57 % de la mise en moyenne ; 45,60 % des tirages perdent toute la mise. |
| Roulette | 107,03 % | Avec ROULETTE_BONUS=1.10 ; un pari rouge/noir perd encore dans 19 cas sur 37. |
| Chevaux | Environ 108 % | Avec HORSE_EDGE=-0.08, petites différences selon arrondi et plancher des cotes. |
| Blackjack | Dépend des décisions | Les pourcentages affichés dans le menu sont indicatifs ; pas de rendement exact établi ici. |

Les jeux sont donc favorables aux joueurs, ce qui convient à un bot entre amis.
Les séries accélèrent leur progression et l'inflation sans changer les chances
d'un tirage. La mise maximum est une permission, pas une protection contre la
perte du solde : miser 50000 avec seulement 50000 disponibles peut toujours
laisser le joueur sans pièces.

Les caisses ont un autre équilibre. Rendement moyen en pièces, avec les chaînes
d'amélioration comprises, XP exclue : commune 81,77 %, rare 84,66 %, épique
86,26 %, légendaire 90,03 %, mythique 104,47 %. Elles absorbent des pièces en
échange d'XP et de la possibilité de gros gains. Le renouvellement à 5000 est
une dépense de confort, pas un achat rentable garanti.

Deux points à discuter avant d'ajuster :

1. Le daily par défaut est 250. Une perte de 50000 représente 200 daily,
   sans compter les autres gains : la récupération peut sembler longue.
   Pour un objectif « amusement sans rester ruiné », une récompense quotidienne
   plus généreuse ou une aide lorsque le solde est bas serait plus adaptée.
2. La roulette peut être utilisée pour créer des pièces sans risque de tirage :
   avec le bonus 1.10, couvrir les 37 numéros à mise égale rend 39,6 mises pour
   37 dépensées (avant arrondis). Cela existe déjà ; les séries le rendent plus
   rapide. Retour arrière à 5000 pour rembourser une perte de 50000, et potion
   ×2 pièces à 2000, deviennent également très puissants à ces mises.

Je conserverais un léger avantage joueur, puis ajusterais les sources gratuites
et les objets selon le rythme souhaité. Aucun de ces ajustements n'est appliqué
dans cette mise à jour, conformément à la demande de discuter l'équilibrage.

## Validation

58 tests passent ; syntaxe des fichiers JavaScript et sérialisation des
commandes/interfaces vérifiées.

Tests automatisés : contrôle du coût global, refus de séries non financées,
conversion 5K, limites, all, paiements avant tirage, résultats communs des
lobbies et durées différentes, anciens paris sans champ count, renouvellement,
boutons périmés et interfaces réunies. Les actions Discord restent à vérifier
sur le serveur après le déploiement, notamment une petite série de 10 tirages.
