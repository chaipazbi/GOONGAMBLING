# Protection et logs du serveur

## Comportement

Tout est désactivé à l'installation. Les réglages sont propres à chaque serveur
et persistés dans data.json. La protection ne kick ni ne ban personne.

Le salon piège (et ses fils) applique un timeout Discord de 28 jours dès la
réception d'un message d'un membre non exempté. Ensuite, le bot tente de copier
les preuves et de supprimer le message. Une copie ou suppression impossible
n'annule pas le timeout. Il n'y a pas de renouvellement automatique : après
28 jours, le timeout expire. Un modérateur peut le lever directement dans Discord.

La protection images compare les pièces jointes à 12 références fournies par
l'administrateur et aux références ajoutées par commande. Elle utilise une
empreinte exacte et une comparaison visuelle locale (contraste, grille couleur,
proportions). Les images redimensionnées ou recompressées proches sont reconnues.
Ce n'est pas une IA qui reconnaît toutes les arnaques : les nouvelles images,
recadrages importants, GIF dont seule une autre frame contient le scam et
images hébergées sur des sites externes peuvent être manqués. Une image légitime
visuellement très proche d'une référence peut provoquer un faux positif.

Les bots, webhooks, le propriétaire du serveur et les rôles explicitement
exemptés sont exclus des sanctions automatiques. Discord refuse les timeouts
sur les administrateurs et les membres que le bot ne peut pas modérer. Le log
indique explicitement l'échec ; aucun kick ou ban ne remplace un timeout refusé.
Le bot n'exempte pas implicitement tous les rôles de modération : configure-les.

Les analyses sont sérialisées pour le droplet à 512 Mo. Maximum 10 images par
message, 8 Mio par image et 20 millions de pixels. Les formats pris en charge
sont JPEG, PNG, WebP, GIF (première image) et AVIF. Les pièces jointes sont
téléchargées uniquement depuis les domaines de fichiers Discord, sans redirection.
Sous forte charge, l'analyse peut être retardée ; au-delà de 30 analyses en
attente, le bot signale qu'elle n'a pas été effectuée, sans sanction sur ce motif.
Le salon piège n'attend pas cette file d'analyse.

## Permissions et réglages Discord

Dans le Developer Portal, conserver Server Members Intent et Message Content
Intent activés, comme pour les fonctions existantes du bot.

Permissions du bot :

- Voir les salons et Voir l'historique des messages dans les salons surveillés.
- Modérer les membres pour les timeouts ; placer son rôle au-dessus des membres
  à protéger. Un membre administrateur ne peut pas être mis en timeout.
- Gérer les messages dans les salons surveillés pour les suppressions.
- Envoyer des messages, Intégrer des liens et Joindre des fichiers dans les logs.
- Voir les logs du serveur pour les événements du journal d'audit.
- Gérer les salons pour recevoir les événements d'invitations dans les salons concernés.

Réserver les salons de preuves/logs aux modérateurs. Le bot n'en modifie pas les
permissions automatiquement. Le salon piège doit être distinct des salons de logs.
Donner aux membres normaux la possibilité d'y écrire, si le piège doit fonctionner.

## Configuration après déploiement

Les commandes de configuration nécessitent Gérer le serveur. Les commandes
répondent en privé. Remplacer les noms des salons et rôles ci-dessous par les tiens.

    /protection logs salon:#logs-protection
    /logs configurer salon:#logs-serveur
    /protection exemption role:@Moderateur exempte:True
    /protection piege actif:True salon:#salon-piege
    /protection images mode:auto

Le mode auto supprime et applique le timeout. Pour tester sans sanction :

    /protection images mode:alert

Test conseillé : utiliser le mode alerte, poster une copie d'une référence avec
un compte non exempté dans un salon normal, vérifier le log et sa pièce jointe,
puis activer auto. Le propriétaire est exempté : ses images ne déclenchent pas
de test. Dans le salon piège, le mode alerte des images ne désactive pas le timeout.

Autres commandes :

    /protection ajouter-image image:<fichier>
    /protection liste-images
    /protection retirer-image id:<identifiant ajouté>
    /protection statut
    /protection demute membre:@Joueur
    /protection piege actif:False
    /protection images mode:off
    /logs statut
    /logs desactiver

Maximum 100 références supplémentaires par serveur, sauvegardées comme
empreintes dans data.json. Les 12 références intégrées sont dans scam-images.json.
Le démutage par commande nécessite aussi Modérer les membres. Un modérateur
peut toujours utiliser la levée de timeout native de Discord selon ses permissions.

## Logs et preuves

La preuve de protection contient le pseudo et l'ID, le salon et l'ID du message,
la raison et l'état de chaque action, le texte complet dans un fichier JSON,
les URLs des fichiers/aperçus et des copies des pièces jointes disponibles.
Le timeout est posé avant la copie ; la suppression est tentée après la copie.
Copie limitée à trois fichiers et 8 Mio au total. Si un fichier est indisponible
ou dépasse les limites, son URL reste dans la preuve et l'incomplétude est signalée.
L'image qui a déclenché la détection est copiée en priorité.

Logs généraux :

- Arrivée et départ de membres ; bans et levées de bans.
- Connexion, déconnexion, déplacement vocal, mute/sourd serveur et personnel,
  caméra et partage d'écran (états seulement, aucun enregistrement audio).
- Messages supprimés, suppressions groupées, modifications avant/après,
  texte et métadonnées de pièces jointes, aperçus et stickers dans les preuves JSON.
- Ajout/retrait de rôles à un membre, pseudo et timeout.
- Création/suppression/modification de salons, fils, rôles et emojis ; invitations.
- Modification du serveur et toutes les entrées d'audit reçues de Discord,
  dont kicks, bans, mutes, rôles, permissions, webhooks et actions administratives.

Le véritable auteur d'une action administrative vient du journal d'audit,
pas d'une supposition basée sur le dernier modérateur actif. Les logs d'événement
et d'audit peuvent concerner la même action et sont affichés séparément.
Pour une suppression, Discord ne fournit pas toujours l'auteur : le bot ne
l'invente pas. Les logs ne peuvent pas couvrir des actions non exposées par Discord.

Le bot conserve au maximum 1000 messages récents pendant 24 heures en mémoire
pour reconstruire les modifications/suppressions. Ce cache est perdu au
redémarrage. Le texte d'un message jamais reçu ou déjà sorti du cache n'est pas
récupérable après sa suppression. Les logs généraux conservent les URLs et
métadonnées des fichiers, pas systématiquement leurs octets ; les liens Discord
peuvent expirer. La copie des fichiers est réservée aux preuves de protection.

Pas de rétroactivité pour les événements ayant eu lieu quand le bot était arrêté.
Une panne Discord, un salon supprimé ou des permissions absentes peut empêcher
l'envoi. Une file de plus de 200 logs est tronquée, avec signalement dans journalctl.
Les logs ne sont pas une archive exhaustive garantie. Les messages dans les
salons de logs et les messages du bot sont ignorés pour éviter les boucles.

## Fichiers à mettre sur GitHub

Remplacer : index.js, commands.js, store.js, package.json.

Ajouter : package-lock.json, protection.js, protection-core.js,
protection-commands.js, scam-images.js, scam-images.json, PROTECTION-ET-LOGS.md,
tests/protection.test.js, tests/protection-integration.test.js,
tests/scam-images.test.js.

Ne pas pousser ni remplacer .env ou data.json. Le ZIP complet conserve les
fonctions précédentes, dont trackers, paris et rôles à l'arrivée.

## Déploiement DigitalOcean

Attendre la fin des jeux de casino en mémoire avant l'arrêt. Après mise à jour
de GitHub, exécuter dans l'ordre et s'arrêter si une étape échoue :

    cd ~/GOONGAMBLING
    mkdir -p ~/backups
    systemctl stop bot-paris
    tar -czf ~/backups/avant-protection-$(date +%Y%m%d-%H%M%S).tgz data.json .env
    git pull --ff-only
    npm ci
    node --test tests/*.test.js
    npm run deploy
    systemctl start bot-paris
    systemctl status bot-paris --no-pager
    journalctl -u bot-paris -n 50 --no-pager

npm ci installe notamment sharp pour la reconnaissance locale. Aucun token ni
abonnement supplémentaire requis. Node 20.20.2 convient. Conserver le lockfile
et ne pas omettre les dépendances optionnelles de sharp.

## Validation

45 tests passent, dont 20 nouveaux tests de protection/reconnaissance/intégration.
Les gestionnaires se construisent sans connexion Discord et les commandes se
sérialisent. La syntaxe des fichiers JavaScript a été vérifiée. Les 12 fichiers
fournis ont aussi été reconnus après redimensionnement à 640 pixels de largeur
et recompression JPEG qualité 70. Cette vérification ne mesure pas tous les
faux positifs ou variantes possibles. Les actions Discord sont simulées dans les
tests : vérifier le salon privé, la hiérarchie et le timeout avec un compte test
non administrateur après installation.
