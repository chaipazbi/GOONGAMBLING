# Suivi League of Legends EUW

Cette version ajoute le suivi LoL au bot existant et conserve les rôles automatiques.
Elle ne connecte pas le suivi aux mises : elle annonce les parties et leurs résultats.
Valorant, CS2, Fortnite et Rocket League ne sont pas intégrés dans cette version.

## Configuration

Node.js 18 ou supérieur requis (fetch et AbortSignal.timeout).
Ajouter dans le .env du droplet, sans publier la clé sur GitHub :

    RIOT_API_KEY=ta_cle_riot

La clé de développement Riot expire après 24 heures. Pour un petit groupe privé,
demander une clé personnelle via le portail Riot et décrire honnêtement le bot.
Une clé invalide ou un accès refusé suspend les requêtes jusqu’au redémarrage.
Les autres commandes du bot continuent à fonctionner.

## Commandes

- /tracker salon salon:#suivi : nécessite Gérer le serveur. Le bot doit avoir
  Voir le salon, Envoyer des messages et Intégrer des liens.
- /tracker lier riot-id:Pseudo#TAG consentement:True : associe son compte LoL EUW
  et démarre le suivi sur ce serveur. Les anciens résultats ne sont pas publiés.
  Le joueur déclare qu’il s’agit de son compte : il ne s’agit pas d’une authentification
  Riot Sign On, et la propriété du compte n’est pas vérifiée.
- /tracker statut : affiche le compte, le salon, le suivi et la partie en cours.
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

Les identifiants de comptes et de matchs publiés sont enregistrés dans data.json.
Après un redémarrage normal, les annonces déjà enregistrées ne sont pas répétées.
Un arrêt brutal entre l’envoi Discord et la sauvegarde peut exceptionnellement
produire un doublon. Un échec d’envoi est réessayé au prochain passage.
Les notifications ne déclenchent pas de mention @everyone ou de ping de rôle.

## Mise à jour du droplet

Pousser sur GitHub les fichiers modifiés : index.js, commands.js, config.js,
store.js, .env.example. Ajouter riot-api.js, tracker.js, TRACKER-LOL.md et tests/.
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

    node --test tests/tracker.test.js
    npm run deploy
    systemctl start bot-paris
    systemctl status bot-paris
    journalctl -u bot-paris -n 50 --no-pager

Exécuter les étapes dans cet ordre et s’arrêter si une commande échoue.
Si le service n’est pas administré en root, préfixer systemctl/journalctl par sudo.
Le ZIP n’est pas envoyé automatiquement sur GitHub.

## Validation

Tous les fichiers JavaScript vérifiés avec node --check.
Six tests automatisés avec réponses Riot simulées : début/fin, reprise d’état,
résultats retardés, échec d’envoi, désassociation, erreurs 404/403 et limite 429.
Aucune connexion réelle Riot/Discord testée sans les identifiants du déploiement.
Le premier test réel consiste à lier un compte EUW, consulter /tracker statut,
puis jouer une partie et vérifier les annonces dans le salon configuré.

## Attribution Riot

Ce produit n’est pas approuvé par Riot Games et ne reflète pas les opinions de
Riot Games ou des personnes officiellement impliquées dans la production ou la
gestion des propriétés de Riot Games. Riot Games et ses propriétés sont des
marques ou des marques déposées de Riot Games, Inc.
