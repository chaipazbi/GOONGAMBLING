# 🐧 Réinstaller le bot sur une VM neuve (depuis zéro)

## 0. Se connecter à la VM

La console web de DigitalOcean a besoin du service `droplet-agent` sur la
machine. Après une réinitialisation, il faut parfois quelques minutes avant
qu'il démarre. Dans l'ordre :

1. **Attendre 3-5 minutes** puis recharger la console.
2. **Power cycle** : panneau DigitalOcean → onglet **Power** → *Power Cycle*.
3. **Recovery Console** : onglet **Access** → *Launch Recovery Console*. Elle
   passe par l'hyperviseur et ne dépend pas de l'agent — elle marche même quand
   la console normale refuse.
4. **SSH depuis ton PC** (le plus fiable au quotidien) :
   ```bash
   ssh root@IP_DE_TA_VM
   ```
   Si tu as créé le droplet avec une clé SSH, ça passe directement. Sinon DigitalOcean
   envoie un mot de passe root par e-mail à la création.

> 💡 Pour la suite, prends l'habitude d'utiliser SSH : ça évite complètement de
> dépendre de la console web.

---

## 1. Cloner le repo

```bash
cd ~
git clone https://github.com/chaipazbi/GOONSOCIETY.git
cd GOONSOCIETY
```

## 2. Tout installer d'un coup

```bash
bash install.sh
```

Le script s'occupe de : swap 1 Go, git/curl, Node.js 20, `npm install`,
création du `.env`, **sauvegarde quotidienne automatique** de `data.json`, et
service systemd prêt à démarrer.

## 3. Remplir le `.env`

```bash
nano .env
```
Colle `DISCORD_TOKEN`, `CLIENT_ID` et `GUILD_ID`.
`Ctrl+O` `Entrée` pour enregistrer, `Ctrl+X` pour quitter. Vérifie avec :
```bash
cat .env
```

## 4. Déployer les commandes et démarrer

```bash
npm run deploy
sudo systemctl start bot-paris
systemctl status bot-paris
```

Logs en direct :
```bash
journalctl -u bot-paris -f
```

---

## 5. Restaurer les soldes

Le bot repart avec un `data.json` vide : chaque joueur reçoit le solde de départ
au premier usage. Pour remettre les montants d'avant, un admin utilise :

```
/eco definir membre:@pseudo montant:1234
/xp definir membre:@pseudo montant:560
```

`definir` **fixe** la valeur (contrairement à `ajouter` qui s'additionne).

---

## 🛟 Ne plus jamais tout reperdre

`install.sh` programme déjà une copie quotidienne dans `~/backups`. Mais une
sauvegarde qui reste sur la VM disparaît avec la VM. Deux compléments :

**Copier une sauvegarde sur ton PC** (à lancer depuis ton PC) :
```bash
scp root@IP_DE_TA_VM:~/GOONSOCIETY/data.json ./data-backup.json
```

**Activer les Backups DigitalOcean** : panneau du droplet → onglet **Backups**.
C'est payant (environ 20 % du prix du droplet) mais ça sauvegarde la machine
entière automatiquement, et ça permet de restaurer d'un clic.

**Vérifier que les sauvegardes tournent**, après quelques jours :
```bash
ls -l ~/backups
```
