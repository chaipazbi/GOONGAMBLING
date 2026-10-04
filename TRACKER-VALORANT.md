# Valorant : statistiques et parties terminées

Le suivi utilise HenrikDev, un fournisseur indépendant non officiel.
Europe / PC uniquement. La clé Riot existante est utilisée lors de la liaison
pour résoudre le Riot ID ; HenrikDev fournit l’historique et le classement.
Les deux clés doivent rester dans le .env du droplet, jamais sur GitHub.

## Configuration

Créer une clé HenrikDev via https://api.henrikdev.xyz/dashboard/ puis ajouter :

    HENRIK_API_KEY=ta_cle_henrikdev

Conserver RIOT_API_KEY pour LoL et la résolution des comptes Riot. Redémarrer le
bot après toute modification des clés. Aucune nouvelle dépendance npm.

## Utilisation

/tracker salon définit le salon commun des annonces LoL et Valorant.
/tracker menu → Valorant → Lier mon compte ouvre le formulaire Riot ID et
consentement. Écrire OUI pour déclarer que le compte est le sien et accepter
la publication des résultats. Il ne s’agit pas d’une connexion Riot Sign On :
la propriété du compte n’est pas vérifiée.

Les boutons donnent accès à :
- Statistiques : rang actuel, RR, meilleur rang disponible, dernière variation
  de RR du compte, K/D, KDA, victoires/défaites, moyennes K/D/A, pourcentage des
  impacts à la tête et agents les plus joués dans les matchs récupérés.
- Historique : résultats, carte, agent, mode, date et K/D/A des derniers matchs.
- Dernière partie : détails du dernier résultat disponible.
- État du suivi, Activer le suivi, Mettre en pause et Délier mon compte.

Les statistiques, l’historique et la dernière partie sont publics dans le salon
qui contient la commande ou le bouton. Liaison et réglages restent privés.
Les commandes directes sont conservées et acceptent maintenant jeu:valorant :

    /tracker stats jeu:valorant nombre:20
    /tracker historique jeu:valorant nombre:10
    /tracker derniere-partie jeu:valorant
    /tracker lier riot-id:Pseudo#TAG consentement:True jeu:valorant

Sans option jeu, les commandes directes utilisent LoL comme auparavant.
Les comptes des deux jeux sont indépendants, même avec le même Riot ID.

## Annonces et limites

Le bot vérifie les 10 dernières parties toutes les deux minutes après la fin du
cycle précédent. Les nouvelles parties commencées après la liaison/activation
sont publiées quand HenrikDev les rend disponibles. Un délai côté fournisseur
peut s’ajouter. Après une longue interruption, des matchs au-delà des dix plus
récents peuvent être manqués. Les identifiants de matchs publiés sont enregistrés
dans data.json et rechargés au redémarrage. Un arrêt brutal entre envoi Discord
et sauvegarde peut exceptionnellement produire un doublon.

Aucune détection du début de partie Valorant, aucun pari automatique Valorant.
Les paris automatiques LoL et les autres fonctions existantes sont conservés.
La dernière variation de RR est celle renvoyée pour le compte ; elle n’est pas
attribuée à chaque match de l’historique ou aux annonces après match.
Les statistiques portent sur les 20 derniers matchs par défaut (maximum 50),
avec tous les modes disponibles. Les résultats nuls/inconnus sont exclus du taux
de victoire. Le score de combat affiché est le total, pas l’ACS moyen par manche.
Aucun historique complet de carrière n’est garanti.

Les requêtes HenrikDev sont espacées de 2,1 secondes. La limite 429 impose une
pause ; une clé refusée suspend les appels jusqu’au redémarrage. Les autres jeux
continuent à fonctionner. Les erreurs ne journalisent pas la clé.
Si la réponse change de format ou si les K/D/A sont absents, le bot signale
l’indisponibilité des données au lieu de fabriquer des statistiques.

## Fichiers de cette mise à jour

Remplacer commands.js, config.js, store.js, tracker.js, .env.example et
TRACKER-LOL.md. Ajouter valorant-api.js, valorant-tracker.js,
TRACKER-VALORANT.md et tests/valorant.test.js.
Ne pas remplacer le .env ni data.json du droplet avec des fichiers du ZIP.

## Déploiement

Après avoir poussé les fichiers sur GitHub, attendre la fin des parties de casino
puis exécuter chaque étape dans l’ordre (s’arrêter si une étape échoue) :

    cd ~/GOONGAMBLING
    mkdir -p ~/backups
    systemctl stop bot-paris
    tar -czf "${HOME}/backups/avant-valorant-$(date +%Y%m%d-%H%M%S).tgz" data.json .env
    git pull --ff-only
    npm install
    nano .env

Ajouter HENRIK_API_KEY et enregistrer, puis :

    node --test tests/*.test.js
    npm run deploy
    systemctl start bot-paris
    systemctl status bot-paris
    journalctl -u bot-paris -n 50 --no-pager

## Validation

22 tests avec réponses simulées passent, ainsi que node --check sur tous les
fichiers JavaScript. Les tests Valorant couvrent les calculs, les champs absents,
la pagination, la reprise de l’état,
les échecs d’envoi et les erreurs 429/403. La connexion réelle HenrikDev/Discord
reste à vérifier sur le droplet avec la clé utilisateur. Les tests ne constituent
pas une validation des réponses réelles pour ce compte ni une garantie de
continuité du fournisseur.

Ce produit n’est pas approuvé par Riot Games et ne reflète pas les opinions de
Riot Games ou des personnes officiellement impliquées dans la production ou la
gestion des propriétés de Riot Games. Riot Games et ses propriétés sont des
marques ou des marques déposées de Riot Games, Inc.
