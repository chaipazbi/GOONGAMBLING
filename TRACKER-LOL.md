# Suivi League of Legends EUW

Cette version ajoute le suivi LoL au bot existant et conserve les rôles automatiques.
Elle annonce les parties et leurs résultats et ouvre des paris automatiques
Victoire / Défaite en GoonCoins sur les parties détectées assez tôt.
Valorant est intégré pour les statistiques et les résultats après les parties (voir TRACKER-VALORANT.md). CS2 et Fortnite ne sont pas intégrés. Rocket League reste sans statistiques ni suivi automatique :
Tracker.gg ne fournit pas son API Rocket League aux développeurs et l’interface
officielle de Rocket League fonctionne côté PC, ce qui ne correspond pas à la
configuration demandée (droplet seul).

## Configuration

Node.js 18 ou supérieur requis (fetch et AbortSignal.timeout).
Ajouter dans le .env du droplet, sans publier la clé sur GitHub :

    RIOT_API_KEY=ta_cle_riot

La clé de développement Riot expire après 24 heures. Pour un petit groupe privé,
demander une clé personnelle via le portail Riot et décrire honnêtement le bot.
Une clé invalide ou un accès refusé suspend les requêtes jusqu’au redémarrage.
Les autres commandes du bot continuent à fonctionner.

## Commandes

/tracker menu propose des boutons de choix du jeu puis les actions du jeu choisi (LoL ou Valorant).
Les consultations stats, historique et derniere-partie sont publiques dans le
salon où la commande ou le bouton est utilisé. La liaison, le consentement et
les réglages restent privés. Les commandes directes précédentes sont conservées.

- /tracker salon salon:#suivi : nécessite Gérer le serveur. Le bot doit avoir
  Voir le salon, Envoyer des messages et Intégrer des liens.
- /tracker lier riot-id:Pseudo#TAG consentement:True : associe son compte LoL EUW
  et démarre le suivi sur ce serveur. Les anciens résultats ne sont pas publiés.
  Le joueur déclare qu’il s’agit de son compte : il ne s’agit pas d’une authentification
  Riot Sign On, et la propriété du compte n’est pas vérifiée.
- /tracker statut : affiche le compte, le salon, le suivi et la partie en cours.
- /tracker stats nombre:20 : K/D, KDA, taux de victoire et cinq champions les plus
  joués sur les parties récentes (1 à 50, 20 par défaut). Tous modes confondus ;
  remakes exclus. Ce n’est pas une statistique de toute la carrière.
- /tracker historique nombre:5 : les dernières parties avec résultat, champion,
  mode, durée, date relative et K/D/A (1 à 10, 5 par défaut).
- /tracker derniere-partie : résultat, champion, K/D/A, durée, mode et farm.
- /tracker desactiver : suspend son suivi.
- /tracker activer : reprend le suivi sans publier les parties de la pause.
- /tracker delier : supprime l’association sur ce serveur.

Le bot vérifie périodiquement les comptes suivis. Ce n’est pas un événement reçu
instantanément de Riot : un cycle commence 60 secondes après la fin du précédent.
Les appels sont sérialisés et espacés de 1,3 seconde ; plus il y a de comptes, plus
le délai augmente. Les résultats peuvent arriver après un délai supplémentaire
côté Riot. Les modes non exposés par Spectator n’auront pas forcément une annonce
de début. Une partie entière entre deux passages peut être annoncée seulement à
sa fin. On consulte les 10 matchs les plus récents : après une longue interruption,
les matchs plus anciens peuvent être manqués. Les parties en dehors d’EUW ne sont
pas couvertes.

Les consultations de statistiques peuvent prendre plus d’une minute, selon le
nombre de matchs et les autres appels en cours. Un cache limité à 300 résultats
en mémoire accélère les consultations répétées ; aucune donnée persistante
supplémentaire n’est ajoutée.

Les identifiants de comptes et de matchs publiés sont enregistrés dans data.json.
Après un redémarrage normal, les annonces déjà enregistrées ne sont pas répétées.
Un arrêt brutal entre l’envoi Discord et la sauvegarde peut exceptionnellement
produire un doublon. Un échec d’envoi est réessayé au prochain passage.
Les notifications ne déclenchent pas de mention @everyone ou de ping de rôle.

## Mise à jour du droplet

Pousser sur GitHub les fichiers modifiés : index.js, commands.js, config.js,
store.js, .env.example. Ajouter riot-api.js, tracker.js, tracker-stats.js, TRACKER-LOL.md et tests/.
Ne pas remplacer ni committer le .env ou data.json du serveur.

Depuis le droplet (attendre que les jeux de casino en cours soient terminés,
car ces jeux existants sont conservés uniquement en mémoire) :

    cd ~/GOONGAMBLING
    mkdir -p ~/backups
    systemctl stop bot-paris
    tar -czf "${HOME}/backups/avant-tracker-lol-$(date +%Y%m%d-%H%M%S).tgz" data.json .env
    git pull --ff-only
    npm install
    nano .env

Ajouter RIOT_API_KEY, enregistrer et quitter nano, puis :

    node --test tests/*.test.js
    npm run deploy
    systemctl start bot-paris
    systemctl status bot-paris
    journalctl -u bot-paris -n 50 --no-pager

Exécuter les étapes dans cet ordre et s’arrêter si une commande échoue.
Si le service n’est pas administré en root, préfixer systemctl/journalctl par sudo.
Le ZIP n’est pas envoyé automatiquement sur GitHub.

## Validation

Tous les fichiers JavaScript vérifiés avec node --check.
Vingt-deux tests automatisés avec réponses Riot simulées : début/fin, reprise d’état,
résultats retardés, échec d’envoi, désassociation, erreurs 404/403 et limite 429.
Aucune connexion réelle Riot/Discord testée sans les identifiants du déploiement.
Le premier test réel consiste à lier un compte EUW, consulter /tracker statut,
puis jouer une partie et vérifier les annonces dans le salon configuré.

## Attribution Riot

Ce produit n’est pas approuvé par Riot Games et ne reflète pas les opinions de
Riot Games ou des personnes officiellement impliquées dans la production ou la
gestion des propriétés de Riot Games. Riot Games et ses propriétés sont des
marques ou des marques déposées de Riot Games, Inc.

## Mise à jour depuis la première version du suivi

Remplacer commands.js, riot-api.js, tracker.js et TRACKER-LOL.md.
Ajouter tracker-stats.js et tests/tracker-stats.test.js.
Le .env, la clé Riot, les comptes liés et les réglages sont conservés.

## Paris automatiques LoL

Un pari Victoire / Défaite est créé pour chaque joueur suivi dont le match est
détecté dans les trois premières minutes. Il utilise l’économie, les cotes,
les récompenses et les boutons du système de paris existant.
Les mises restent ouvertes au maximum deux minutes après la détection, et
jamais après trois minutes depuis le début indiqué par Riot. Une partie détectée
plus tard est annoncée sans nouveau pari. Le joueur suivi ne peut pas miser sur
sa propre partie. Le créateur du pari est le bot ; seuls les membres ayant Gérer
le serveur peuvent utiliser les boutons d’administration.

La fermeture est vérifiée chaque seconde, et également au moment d’enregistrer
une mise. La récupération du résultat se fait périodiquement. Le résultat Riot
règle automatiquement le pari. Les remakes (moins de cinq minutes avec le champ
Riot gameEndedInEarlySurrender), l’absence du joueur dans le résultat ou l’absence
de résultat pendant six heures entraînent un remboursement.
Les paris en cours et leurs échéances sont stockés dans data.json. Même si le
compte est ensuite dissocié ou mis en pause, leurs résultats continuent à être
recherchés. Les messages sont actualisés au passage suivant, donc un bouton peut
encore paraître actif quelques secondes après l’échéance mais les mises tardives
sont refusées. Un administrateur peut annuler ou corriger le pari manuellement.

Les conditions des fournisseurs de données restent applicables ; le fait que les
GoonCoins soient fictifs ne constitue pas une confirmation de leur acceptation
par Riot. Aucun moyen de paiement n’est ajouté.

## Mise à jour depuis la version statistiques

Remplacer index.js, commands.js, bets.js, ui.js, riot-api.js, tracker.js et
TRACKER-LOL.md. Ajouter tracker-bets.js et tests/tracker-bets.test.js.
Aucune modification du .env nécessaire. Comptes et réglages existants conservés.
Le menu s’ouvre avec /tracker menu ; le choix LoL donne accès à toutes les actions.
Pour analyser 50 parties au lieu de 20, la commande directe /tracker stats nombre:50
reste disponible.
