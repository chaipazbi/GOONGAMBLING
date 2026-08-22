import {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config, money } from './config.js';
import { ensureUser, save, getData } from './store.js';
import * as eco from './economy.js';
import * as L from './levels.js';
import * as B from './bets.js';
import * as ui from './ui.js';
import { startScheduler } from './scheduler.js';
import { today } from './time.js';
import { rollShop, crateById, crateCount, giveCrates, takeCrates, openFromInventory } from './shop.js';
import * as cui from './casino-ui.js';
import * as SLOTS from './slots.js';
import * as items from './items.js';
import * as missions from './missions.js';
import * as xui from './extra-ui.js';
import * as BJ from './blackjack.js';
import * as R from './roulette.js';
import * as H from './horserace.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Parties/lobbies en mémoire (clé = id du message du jeu).
const bjGames = new Map();
const bjTables = new Map();
const roulLobbies = new Map();
const horseLobbies = new Map();

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`   Monnaie : ${config.currencyName} (${config.currencySymbol})`);
  console.log(`   Serveurs : ${c.guilds.cache.size}`);
  startScheduler(client);
  L.setCoinBonusHandler((g, u, amt) => eco.addBalance(g, u, amt));
});

const priv = (i, content) => i.reply({ content, ephemeral: true });

function peutGerer(interaction, bet) {
  if (bet.creatorId === interaction.user.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function majMessage(interaction, bet) {
  try {
    let message = interaction.message;
    if ((!message || message.id !== bet.messageId) && bet.channelId && bet.messageId) {
      const channel = await client.channels.fetch(bet.channelId);
      message = await channel.messages.fetch(bet.messageId);
    }
    if (message) await message.edit({ embeds: [ui.betEmbed(bet)], components: ui.betComponents(bet) });
  } catch (err) {
    console.error('Rafraîchissement du pari impossible :', err.message);
  }
}

async function envoyerDansSalon(interaction, bet, payload) {
  const channel = interaction.channel ?? (bet.channelId ? await client.channels.fetch(bet.channelId) : null);
  if (channel) await channel.send(payload);
}

// ============ ROUTAGE ============

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.guildId) {
      if (interaction.isRepliable()) {
        return priv(interaction, "Ce bot s'utilise uniquement sur un serveur.");
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('shop:')) return await onShopButton(interaction);
      if (interaction.customId.startsWith('inv:')) return await onInventoryButton(interaction);
      if (interaction.customId.startsWith('bjtable:')) return await onBjTableButton(interaction);
      if (interaction.customId.startsWith('bjhand:')) return await onBjHandButton(interaction);
      if (interaction.customId.startsWith('slots:')) return await onSlotsButton(interaction);
      if (interaction.customId.startsWith('obj:')) return await onObjetsButton(interaction);
      if (interaction.customId.startsWith('miss:')) return await onMissionsButton(interaction);
      if (interaction.customId.startsWith('bj:')) return await onBlackjackButton(interaction);
      if (interaction.customId.startsWith('roul:')) return await onRouletteButton(interaction);
      if (interaction.customId.startsWith('horse:')) return await onHorseButton(interaction);
      return await onButton(interaction);
    }
    if (interaction.isStringSelectMenu()) return await onSelect(interaction);
    if (interaction.isModalSubmit()) return await onModal(interaction);
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case 'solde':      return await cmdSolde(interaction);
      case 'daily':      return await cmdDaily(interaction);
      case 'donner':     return await cmdDonner(interaction);
      case 'classement': return await cmdClassement(interaction);
      case 'stats':      return await cmdStats(interaction);
      case 'eco':        return await cmdEco(interaction);
      case 'xp':         return await cmdXp(interaction);
      case 'boutique':   return await cmdBoutique(interaction);
      case 'inventaire': return await cmdInventaire(interaction);
      case 'caisses':    return await cmdCaisses(interaction);
      case 'caisse':     return await cmdCaisseAdmin(interaction);
      case 'refresh-boutique': return await cmdRefreshBoutique(interaction);
      case 'blackjack':  return await interaction.reply({ ...cui.blackjackMenu(), ephemeral: true });
      case 'roulette':   return await interaction.reply({ ...cui.rouletteMenu(), ephemeral: true });
      case 'course-de-cheval': return await interaction.reply({ ...cui.horseMenu(), ephemeral: true });
      case 'serveurs':   return await cmdServeurs(interaction);
      case 'slots':      return await interaction.reply({ ...xui.slotsMenu(), ephemeral: true });
      case 'objets':     return await cmdObjets(interaction);
      case 'missions':   return await cmdMissions(interaction);
      case 'pari':       return await cmdPari(interaction);
    }
  } catch (err) {
    console.error('Erreur interaction :', err);
    const msg = 'Une erreur est survenue. Réessaie dans un instant.';
    if (interaction.replied || interaction.deferred) interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

// ============ BOUTONS ============

async function onButton(interaction) {
  const [ns, action, betIdStr, optIdxStr] = interaction.customId.split(':');
  if (ns !== 'pari') return;

  const bet = B.getBet(interaction.guildId, parseInt(betIdStr, 10));
  if (!bet) return priv(interaction, "Ce pari n'existe plus.");

  if (action === 'wager') return await ouvrirModalMise(interaction, bet, parseInt(optIdxStr, 10));
  if (action === 'lock') return await verrouiller(interaction, bet);
  if (action === 'refund') return await rembourser(interaction, bet);
  if (action === 'close' || action === 'fix') return await menuGagnant(interaction, bet, action);
}

async function ouvrirModalMise(interaction, bet, optIndex) {
  if (bet.status !== 'open') return priv(interaction, "Ce pari n'accepte plus de mises.");
  const option = bet.options[optIndex];
  if (!option) return priv(interaction, 'Issue introuvable.');

  const autre = bet.wagers.find((w) => w.userId === interaction.user.id && w.option !== option);
  if (autre) {
    return priv(interaction, `Tu as déjà misé sur **${autre.option}** — impossible de parier des deux côtés.`);
  }

  const modal = new ModalBuilder()
    .setCustomId(`pari:amount:${bet.id}:${optIndex}`)
    .setTitle(`Miser sur ${option}`.slice(0, 45));

  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(`Montant (cote actuelle ${B.oddsLabel(bet, option)})`.slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Solde dispo : ${eco.getBalance(interaction.guildId, interaction.user.id)}`)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function verrouiller(interaction, bet) {
  if (!peutGerer(interaction, bet)) return priv(interaction, 'Réservé au créateur du pari ou à un admin.');
  if (bet.status !== 'open') return priv(interaction, "Ce pari n'est pas ouvert.");

  B.setStatus(bet, 'closed');
  await majMessage(interaction, bet);
  return priv(interaction, `🔒 Pari #${bet.id} verrouillé — plus aucune mise possible.`);
}

async function rembourser(interaction, bet) {
  if (!peutGerer(interaction, bet)) return priv(interaction, 'Réservé au créateur du pari ou à un admin.');
  if (bet.status === 'cancelled') return priv(interaction, `Le pari #${bet.id} est déjà remboursé.`);

  const etaitClos = bet.status === 'resolved';
  const nb = B.refundAll(bet);
  await majMessage(interaction, bet);
  await interaction.reply(
    `🔄 Pari **#${bet.id} — ${bet.title}** remboursé (${nb} parieur(s)).` +
      (etaitClos ? '\n_Les gains versés à la clôture ont été repris._' : '')
  );
}

async function menuGagnant(interaction, bet, action) {
  if (!peutGerer(interaction, bet)) return priv(interaction, 'Réservé au créateur du pari ou à un admin.');
  if (bet.status === 'cancelled') return priv(interaction, `Le pari #${bet.id} a été remboursé.`);
  if (action === 'fix' && !bet.settlement) return priv(interaction, "Ce pari n'a pas encore été clôturé.");

  const titre =
    action === 'fix'
      ? `✏️ Nouveau résultat pour le pari **#${bet.id} — ${bet.title}** ?\n_Les gains déjà versés seront repris avant de repayer._`
      : `🏆 Quelle est l'issue gagnante du pari **#${bet.id} — ${bet.title}** ?`;

  return interaction.reply({
    content: titre,
    components: [ui.winnerSelect(bet, action === 'fix' ? 'fixwinner' : 'winner')],
    ephemeral: true,
  });
}

// ============ CHOIX DU GAGNANT ============

async function onSelect(interaction) {
  const [ns, action, betIdStr] = interaction.customId.split(':');
  if (ns !== 'pari' || (action !== 'winner' && action !== 'fixwinner')) return;

  const bet = B.getBet(interaction.guildId, parseInt(betIdStr, 10));
  if (!bet) return interaction.update({ content: "Ce pari n'existe plus.", components: [] });
  if (!peutGerer(interaction, bet)) {
    return interaction.update({ content: "Tu n'as pas la permission.", components: [] });
  }
  if (bet.status === 'cancelled') {
    return interaction.update({ content: `Le pari #${bet.id} a été remboursé.`, components: [] });
  }

  const gagnante = bet.options[parseInt(interaction.values[0], 10)];
  if (!gagnante) return interaction.update({ content: 'Issue introuvable.', components: [] });

  const correction = action === 'fixwinner' && bet.settlement;
  const ancienne = bet.settlement?.winningOption ?? null;

  if (correction && ancienne === gagnante) {
    return interaction.update({ content: `Le résultat est déjà **${gagnante}**.`, components: [] });
  }

  if (correction) B.resettle(bet, gagnante);
  else B.settle(bet, gagnante);

  if (!correction && bet.settlement) {
    for (const e of bet.settlement.entries) {
      if (e.kind === 'win') {
        items.applyWin(bet.guildId, e.userId, e.net);
        items.applyXp(bet.guildId, e.userId, e.xp);
        missions.track(bet.guildId, e.userId, 'bet_win', 1);
      } else if (e.kind === 'lose') {
        items.recordLoss(bet.guildId, e.userId, e.stake, 'pari');
      }
    }
  }

  await majMessage(interaction, bet);
  await interaction.update({
    content: correction
      ? `✏️ Résultat corrigé : **${ancienne}** → **${gagnante}**.`
      : `✅ Pari #${bet.id} clôturé sur **${gagnante}**.`,
    components: [],
  });

  const embed = ui.settlementEmbed(bet);
  if (correction) {
    embed.setTitle(`✏️ Pari #${bet.id} — résultat corrigé`);
    embed.setColor(0xe67e22);
    embed.setDescription(
      `Ancien résultat : ~~${ancienne}~~ — les gains correspondants ont été repris.\n\n` + embed.data.description
    );
  }
  return envoyerDansSalon(interaction, bet, { embeds: [embed] });
}

// ============ SAISIE DU MONTANT ============

async function onModal(interaction) {
  if (interaction.customId.startsWith('slots:betmodal')) return await onSlotsBetModal(interaction);
  if (interaction.customId.startsWith('bj:tablemodal')) return await onBjTableModal(interaction);
  if (interaction.customId.startsWith('bj:betmodal')) return await onBlackjackBetModal(interaction);
  if (interaction.customId.startsWith('roul:betmodal')) return await onRouletteBetModal(interaction);
  if (interaction.customId.startsWith('horse:betmodal')) return await onHorseBetModal(interaction);

  const [ns, action, betIdStr, optIdxStr] = interaction.customId.split(':');
  if (ns !== 'pari' || action !== 'amount') return;

  const bet = B.getBet(interaction.guildId, parseInt(betIdStr, 10));
  if (!bet) return priv(interaction, "Ce pari n'existe plus.");
  if (bet.status !== 'open') return priv(interaction, "Ce pari n'accepte plus de mises.");

  const option = bet.options[parseInt(optIdxStr, 10)];
  if (!option) return priv(interaction, 'Issue introuvable.');

  const brut = interaction.fields.getTextInputValue('amount').replace(/\s/g, '');
  const userId = interaction.user.id;
  const solde = eco.getBalance(interaction.guildId, userId);
  const montant = /^(all|tout|max)$/i.test(brut) ? solde : parseInt(brut, 10);

  if (!Number.isInteger(montant) || montant <= 0) {
    return priv(interaction, "Montant invalide. Entre un nombre entier positif (ex : 100), ou `all` pour tout miser.");
  }

  const res = B.placeWager(bet, userId, option, montant);
  if (res.ok) missions.track(g, userId, 'wager_total', montant);
  if (!res.ok) {
    if (res.reason === 'solde') return priv(interaction, `Solde insuffisant. Tu as ${money(solde)}.`);
    if (res.reason === 'min') return priv(interaction, `Mise minimum : ${money(config.minWager)}.`);
    if (res.reason === 'autre_option') return priv(interaction, `Tu as déjà misé sur **${res.option}**.`);
    return priv(interaction, 'Impossible de miser sur ce pari.');
  }

  await interaction.reply({
    content:
      `✅ Mise de ${money(montant)} sur **${option}** enregistrée !\n` +
      `Cote actuelle **${B.oddsLabel(bet, option)}** — elle évoluera jusqu'à la clôture.`,
    ephemeral: true,
  });
  await majMessage(interaction, bet);
}

// ============ COMMANDES : MONNAIE ============

async function cmdSolde(interaction) {
  const g = interaction.guildId;
  const cible = interaction.options.getUser('membre') || interaction.user;
  const solde = eco.getBalance(g, cible.id);
  const qui = cible.id === interaction.user.id ? 'Ton solde' : `Solde de ${cible}`;
  return interaction.reply(`${qui} : ${money(solde)}`);
}

async function cmdDaily(interaction) {
  const g = interaction.guildId;
  const auto = interaction.options.getString('auto');
  const userId = interaction.user.id;

  if (auto) {
    if (/^(off|stop|non|desactiver|désactiver)$/i.test(auto.trim())) {
      eco.setAutoDaily(g, userId, null);
      return priv(interaction, '⏰ Collecte automatique désactivée.');
    }
    const heure = eco.parseHeure(auto);
    if (!heure) {
      return priv(interaction, 'Heure invalide. Utilise le format `09:00` (ou `off` pour désactiver).');
    }
    eco.setAutoDaily(g, userId, heure);
    return priv(
      interaction,
      `⏰ Collecte automatique activée à **${heure}** (heure de ${config.timezone}).\n` +
        `Tu recevras ${money(config.dailyAmount)} et **${config.xpDailyAuto} XP** chaque jour en message privé.\n` +
        `_Le \`/daily\` manuel rapporte davantage : **${config.xpDaily} XP**._`
    );
  }

  const res = eco.claimDaily(g, userId);
  if (!res.ok) {
    return priv(interaction, '⏳ Tu as déjà récupéré ton daily aujourd\'hui ! Reviens demain. 🌙');
  }

  missions.track(g, userId, 'daily_done', 1);
  let msg = `🎁 Tu reçois ${money(res.amount)} et **+${config.xpDaily} XP** ! Nouveau solde : ${money(res.balance)}`;
  if (res.xp?.levelUp) msg += `\n🎉 Niveau **${res.xp.level}** atteint !`;
  return interaction.reply(msg);
}

async function cmdDonner(interaction) {
  const g = interaction.guildId;
  const from = interaction.user;
  const to = interaction.options.getUser('membre');
  const montant = interaction.options.getInteger('montant');

  if (to.id === from.id) return priv(interaction, "Tu ne peux pas te donner de l'argent à toi-même.");
  if (to.bot) return priv(interaction, "Tu ne peux pas donner de l'argent à un bot.");

  const res = eco.transfer(g, from.id, to.id, montant);
  if (!res.ok) return priv(interaction, `Solde insuffisant. Tu as ${money(eco.getBalance(g, from.id))}.`);

  return interaction.reply(`💸 ${from} a donné ${money(montant)} à ${to} !`);
}

async function cmdClassement(interaction) {
  const kind = interaction.options.getString('type') || 'coins';
  const top = L.leaderboard(interaction.guildId, kind, 10);
  return interaction.reply({ embeds: [ui.leaderboardEmbed(top, kind)] });
}

async function cmdStats(interaction) {
  const cible = interaction.options.getUser('membre') || interaction.user;
  const membre = (await interaction.guild.members.fetch(cible.id).catch(() => null)) || cible;
  return interaction.reply({ embeds: [ui.profilEmbed(ensureUser(interaction.guildId, cible.id), membre)] });
}

async function cmdEco(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const cible = interaction.options.getUser('membre');
  const montant = interaction.options.getInteger('montant');

  if (sub === 'ajouter') {
    const bal = eco.addBalance(g, cible.id, montant);
    return interaction.reply(`✅ ${money(montant)} ajoutés à ${cible}. Solde : ${money(bal)}`);
  }
  if (sub === 'retirer') {
    const bal = eco.setBalance(g, cible.id, Math.max(0, eco.getBalance(g, cible.id) - montant));
    return interaction.reply(`✅ ${money(montant)} retirés à ${cible}. Solde : ${money(bal)}`);
  }
  if (sub === 'definir') {
    const bal = eco.setBalance(g, cible.id, montant);
    return interaction.reply(`✅ Solde de ${cible} fixé à ${money(bal)}.`);
  }
}

async function cmdXp(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const cible = interaction.options.getUser('membre');
  const montant = interaction.options.getInteger('montant');
  const u = ensureUser(g, cible.id);
  const avant = L.levelFromXp(u.xp);

  if (sub === 'ajouter') L.addXp(g, cible.id, montant);
  else if (sub === 'retirer') L.addXp(g, cible.id, -montant);
  else L.setXp(g, cible.id, montant);

  const apres = L.levelFromXp(u.xp);
  const verbe = sub === 'ajouter' ? 'ajoutés à' : sub === 'retirer' ? 'retirés à' : 'fixés pour';

  let msg = `✨ **${montant}** XP ${verbe} ${cible}. Total : **${u.xp}** XP — niveau **${apres}**.`;
  if (apres > avant) msg += `\n🎉 Niveau **${apres}** atteint !`;
  else if (apres < avant) msg += `\n📉 Redescendu du niveau ${avant} au niveau ${apres}.`;
  return interaction.reply(msg);
}

// ============ BOUTIQUE ============

function ensureShop(guildId, userId) {
  const u = ensureUser(guildId, userId);
  const t = today();
  if (!u.shop || u.shop.date !== t) {
    u.shop = { date: t, slots: rollShop().map((id) => ({ id, bought: false })) };
    save();
  }
  return u;
}

async function cmdBoutique(interaction) {
  const u = ensureShop(interaction.guildId, interaction.user.id);
  return interaction.reply({
    embeds: [ui.shopEmbed(u)],
    components: ui.shopComponents(u),
    ephemeral: true,
  });
}

async function onShopButton(interaction) {
  const [, action, idxStr] = interaction.customId.split(':');
  if (action !== 'buy') return;

  const g = interaction.guildId;
  const userId = interaction.user.id;
  const u = ensureUser(g, userId);
  const t = today();

  if (!u.shop || u.shop.date !== t) {
    return priv(interaction, 'La boutique a été renouvelée. Relance `/boutique`.');
  }

  const slot = u.shop.slots[parseInt(idxStr, 10)];
  if (!slot) return priv(interaction, 'Caisse introuvable.');
  if (slot.bought) return priv(interaction, 'Tu as déjà ouvert cette caisse aujourd\'hui.');

  const crate = crateById(slot.id);
  if (eco.getBalance(g, userId) < crate.prix) {
    return priv(interaction, `Solde insuffisant. Il te faut ${money(crate.prix)}.`);
  }

  // Achat : la caisse part dans l'inventaire (elle s'ouvre via /inventaire)
  eco.addBalance(g, userId, -crate.prix);
  giveCrates(g, userId, slot.id, 1, { spent: crate.prix });
  slot.bought = true;
  save();

  await interaction.update({ embeds: [ui.shopEmbed(u)], components: ui.shopComponents(u) });
  await interaction.followUp({
    content: `${crate.emoji} Caisse **${crate.nom}** ajoutée à ton inventaire ! Ouvre-la avec \`/inventaire\`.`,
    ephemeral: true,
  });
}

// ============ INVENTAIRE ============

async function cmdInventaire(interaction) {
  const cible = interaction.options.getUser('membre') || interaction.user;
  const own = cible.id === interaction.user.id;
  const membre = (await interaction.guild.members.fetch(cible.id).catch(() => null)) || cible;
  const u = ensureUser(interaction.guildId, cible.id);
  return interaction.reply({
    embeds: [ui.inventoryEmbed(u, membre)],
    components: ui.inventoryComponents(u, own),
    ephemeral: true,
  });
}

async function onInventoryButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  if (action !== 'open') return;

  const g = interaction.guildId;
  const userId = interaction.user.id;
  const u = ensureUser(g, userId);

  if (crateCount(u, id) < 1) return priv(interaction, "Tu n'as plus cette caisse.");

  const result = openFromInventory(g, userId, id);
  if (!result) return priv(interaction, "Tu n'as plus cette caisse.");
  missions.track(g, userId, 'crate_open', 1);

  // Rafraîchit l'inventaire (privé) puis publie le résultat dans le salon
  await interaction.update({
    embeds: [ui.inventoryEmbed(u, interaction.member)],
    components: ui.inventoryComponents(u, true),
  });
  if (interaction.channel) {
    await interaction.channel.send({ embeds: [ui.crateResultEmbed(interaction.member, id, result)] });
  }
}

// ============ CAISSES (infos + admin) ============

async function cmdCaisses(interaction) {
  return interaction.reply({ embeds: [ui.cratesInfoEmbed()] });
}

async function cmdCaisseAdmin(interaction) {
  const sub = interaction.options.getSubcommand();
  const cible = interaction.options.getUser('membre');
  const rarete = interaction.options.getString('rarete');
  const n = interaction.options.getInteger('nombre') || 1;
  const crate = crateById(rarete);

  if (sub === 'donner') {
    giveCrates(interaction.guildId, cible.id, rarete, n);
    return interaction.reply(`${crate.emoji} **${n}** caisse(s) **${crate.nom}** donnée(s) à ${cible}.`);
  }
  if (sub === 'retirer') {
    const retire = takeCrates(interaction.guildId, cible.id, rarete, n);
    return interaction.reply(`${crate.emoji} **${retire}** caisse(s) **${crate.nom}** retirée(s) à ${cible}.`);
  }
}

async function cmdRefreshBoutique(interaction) {
  const g = interaction.guildId;
  const cible = interaction.options.getUser('membre');
  const fresh = () => ({ date: today(), slots: rollShop().map((id) => ({ id, bought: false })) });

  if (cible) {
    ensureUser(g, cible.id).shop = fresh();
    save();
    return interaction.reply(`🔄 Boutique de ${cible} renouvelée — elle/il peut refaire \`/boutique\`.`);
  }

  const guild = getData().guilds[g];
  const users = guild ? Object.values(guild.users) : [];
  for (const u of users) u.shop = fresh();
  save();
  return interaction.reply(
    `🔄 Boutique renouvelée pour **${users.length}** joueur(s) du serveur. Nouvelle sélection dispo via \`/boutique\`.`
  );
}

// ============ SLOTS / OBJETS / MISSIONS ============

function describeExtra(w) {
  const parts = [];
  if (w.bonus > 0) parts.push(`🧪 ×2 pièces : +${w.bonus.toLocaleString('fr-FR')}`);
  if (w.drops && w.drops.length) {
    parts.push('🎁 Drop : ' + w.drops.map((id) => `${items.ITEMS[id].emoji} ${items.ITEMS[id].nom}`).join(', '));
  }
  return parts.join(' · ');
}

async function onSlotsButton(interaction) {
  const sub = interaction.customId.split(':')[1];
  if (sub === 'rules') return interaction.reply({ embeds: [xui.slotsRulesEmbed()], ephemeral: true });
  return interaction.showModal(miseModal('slots:betmodal', 'Machine à sous — ta mise'));
}

async function onSlotsBetModal(interaction) {
  const g = interaction.guildId;
  const userId = interaction.user.id;
  const { montant, err } = parseMise(interaction.fields.getTextInputValue('mise'), eco.getBalance(g, userId));
  if (err) return priv(interaction, err);

  eco.addBalance(g, userId, -montant);
  const res = SLOTS.spin(montant);
  let extra = '';
  if (res.gain > 0) {
    eco.addBalance(g, userId, res.gain);
    extra = describeExtra(items.applyWin(g, userId, res.gain - montant));
  } else {
    items.recordLoss(g, userId, montant, 'machine à sous');
  }
  missions.track(g, userId, 'casino_play', 1);
  missions.track(g, userId, 'slots_play', 1);
  missions.track(g, userId, 'wager_total', montant);

  return interaction.reply({ embeds: [xui.slotsResultEmbed(interaction.member, montant, res, extra)] });
}

async function cmdObjets(interaction) {
  const cible = interaction.options.getUser('membre') || interaction.user;
  const own = cible.id === interaction.user.id;
  const membre = (await interaction.guild.members.fetch(cible.id).catch(() => null)) || cible;
  const u = ensureUser(interaction.guildId, cible.id);
  return interaction.reply({ embeds: [xui.objetsEmbed(u, membre)], components: xui.objetsComponents(u, own), ephemeral: true });
}

async function onObjetsButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  const g = interaction.guildId;
  const userId = interaction.user.id;
  const u = ensureUser(g, userId);

  if (action === 'buy') {
    const it = items.ITEMS[id];
    if (!it) return priv(interaction, 'Objet inconnu.');
    if (eco.getBalance(g, userId) < it.prix) return priv(interaction, `Solde insuffisant (${money(it.prix)}).`);
    eco.addBalance(g, userId, -it.prix);
    items.giveItem(g, userId, id, 1);
    return interaction.update({ embeds: [xui.objetsEmbed(u, interaction.member)], components: xui.objetsComponents(u, true) });
  }

  if (action === 'arm') {
    const r = items.arm(g, userId, id);
    if (!r.ok) {
      const msg = r.reason === 'none' ? "Tu n'as pas cet objet." : r.reason === 'already' ? 'Cette potion est déjà armée.' : 'Impossible.';
      return priv(interaction, msg);
    }
    return interaction.update({ embeds: [xui.objetsEmbed(u, interaction.member)], components: xui.objetsComponents(u, true) });
  }

  if (action === 'rewind') {
    const r = items.useRewind(g, userId);
    if (!r.ok) {
      return priv(interaction, r.reason === 'none' ? "Tu n'as pas de Retour arrière." : 'Aucune perte récente à annuler.');
    }
    await interaction.update({ embeds: [xui.objetsEmbed(u, interaction.member)], components: xui.objetsComponents(u, true) });
    return interaction.followUp({ content: `⏪ Retour arrière : ${money(r.montant)} récupérés${r.label ? ` (${r.label})` : ''}.`, ephemeral: true });
  }
}

async function cmdMissions(interaction) {
  const m = missions.getMissions(interaction.guildId, interaction.user.id);
  return interaction.reply({ embeds: [xui.missionsEmbed(m, interaction.member)], components: xui.missionsComponents(m), ephemeral: true });
}

async function onMissionsButton(interaction) {
  const [, action, idxStr] = interaction.customId.split(':');
  if (action === 'catalog') {
    return interaction.reply({ embeds: [xui.missionsCatalogEmbed()], ephemeral: true });
  }
  if (action !== 'claim') return;
  const g = interaction.guildId;
  const userId = interaction.user.id;
  const r = missions.claim(g, userId, parseInt(idxStr, 10));
  if (!r.ok) {
    const msg = r.reason === 'deja' ? 'Déjà récupérée.' : r.reason === 'incomplet' ? 'Mission pas encore terminée.' : 'Introuvable.';
    return priv(interaction, msg);
  }
  const m = missions.getMissions(g, userId);
  let txt = `🎯 Mission accomplie : +${money(r.coins)} et +${r.xp} XP.`;
  if (r.levelUp) txt += ` 🎉 Niveau **${r.level}** atteint !`;
  await interaction.update({ embeds: [xui.missionsEmbed(m, interaction.member)], components: xui.missionsComponents(m) });
  return interaction.followUp({ content: txt, ephemeral: true });
}

// ============ PROPRIÉTAIRE ============

async function cmdServeurs(interaction) {
  if (!config.ownerId || interaction.user.id !== config.ownerId) {
    return priv(interaction, "Cette commande est réservée au propriétaire du bot.");
  }

  const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
  const lignes = guilds.map(
    (g, i) => `**${i + 1}.** ${g.name} — \`${g.id}\` (${g.memberCount} membres)`
  );

  const total = guilds.length;
  const chunks = [];
  let buf = `Le bot est présent sur **${total}** serveur(s) :\n\n`;
  for (const l of lignes) {
    if ((buf + l).length > 1900) {
      chunks.push(buf);
      buf = '';
    }
    buf += l + '\n';
  }
  if (buf) chunks.push(buf);

  await interaction.reply({ content: chunks[0], ephemeral: true });
  for (const c of chunks.slice(1)) await interaction.followUp({ content: c, ephemeral: true });
}

// ============ JEUX : helpers ============

function canRun(interaction, lobby) {
  return lobby.ownerId === interaction.user.id ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function parseMise(raw, solde) {
  const brut = String(raw).replace(/\s/g, '');
  const montant = /^(all|tout|max)$/i.test(brut) ? solde : parseInt(brut, 10);
  if (!Number.isInteger(montant) || montant <= 0) return { err: 'Montant invalide (ex : 100, ou `all`).' };
  if (montant > solde) return { err: `Solde insuffisant. Tu as ${money(solde)}.` };
  return { montant };
}

function miseModal(customId, titre, extra = []) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('mise').setLabel('Montant').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    ...extra,
  ];
  return new ModalBuilder().setCustomId(customId).setTitle(titre).addComponents(...rows);
}

// ============ BLACKJACK ============

async function onBlackjackButton(interaction) {
  const action = interaction.customId.split(':')[1];

  if (action === 'menu') {
    const sub = interaction.customId.split(':')[2];
    if (sub === 'odds') return interaction.reply({ embeds: [cui.blackjackOddsEmbed()], ephemeral: true });
    if (sub === 'rules') return interaction.reply({ embeds: [cui.blackjackRulesEmbed()], ephemeral: true });
    if (sub === 'public') return interaction.showModal(miseModal('bj:tablemodal', "Table publique — mise d'entrée"));
    // private -> table solo contre le croupier
    return interaction.showModal(miseModal('bj:betmodal', 'Blackjack — ta mise'));
  }

  // Actions de jeu
  const game = bjGames.get(interaction.message.id);
  if (!game) return priv(interaction, 'Cette partie est terminée.');
  if (interaction.user.id !== game.userId) return priv(interaction, "Ce n'est pas ta partie.");

  const g = interaction.guildId;
  if (action === 'hit') BJ.hit(game);
  else if (action === 'stand') BJ.stand(game);
  else if (action === 'double') {
    const extra = game.bet;
    if (eco.getBalance(g, game.userId) < extra) return priv(interaction, 'Solde insuffisant pour doubler.');
    eco.addBalance(g, game.userId, -extra);
    BJ.double(game);
  }

  await interaction.update({
    embeds: [cui.blackjackGameEmbed(game, interaction.member)],
    components: cui.blackjackComponents(game),
  });

  if (game.status === 'done') {
    await bjResolve(interaction, g, game.userId, game);
    bjGames.delete(interaction.message.id);
  }
}

async function onBlackjackBetModal(interaction) {
  const g = interaction.guildId;
  const userId = interaction.user.id;
  const solde = eco.getBalance(g, userId);
  const { montant, err } = parseMise(interaction.fields.getTextInputValue('mise'), solde);
  if (err) return priv(interaction, err);

  eco.addBalance(g, userId, -montant);
  const game = BJ.newGame(userId, montant);

  await interaction.reply({
    embeds: [cui.blackjackGameEmbed(game, interaction.member)],
    components: cui.blackjackComponents(game),
  });
  const msg = await interaction.fetchReply();

  missions.track(g, userId, 'wager_total', montant);
  if (game.status === 'done') {
    await bjResolve(interaction, g, userId, game);
  } else {
    bjGames.set(msg.id, game);
  }
}

async function bjResolve(interaction, g, userId, game) {
  missions.track(g, userId, 'casino_play', 1);
  if (game.outcome === 'win' || game.outcome === 'blackjack') {
    eco.addBalance(g, userId, game.payout);
    const extra = describeExtra(items.applyWin(g, userId, game.payout - game.bet));
    if (extra) interaction.followUp({ content: extra, ephemeral: true }).catch(() => {});
  } else if (game.outcome === 'push') {
    eco.addBalance(g, userId, game.payout);
  } else {
    items.recordLoss(g, userId, game.bet, 'blackjack');
  }
}

// ============ BLACKJACK — TABLE PUBLIQUE (JcJ) ============

async function onBjTableModal(interaction) {
  const g = interaction.guildId;
  const userId = interaction.user.id;
  const { montant: ante, err } = parseMise(interaction.fields.getTextInputValue('mise'), eco.getBalance(g, userId));
  if (err) return priv(interaction, err);

  eco.addBalance(g, userId, -ante);
  const table = {
    guildId: g,
    channelId: interaction.channelId,
    ownerId: userId,
    ante,
    phase: 'lobby',
    players: [{ userId, hand: [], status: 'waiting' }],
    messageId: null,
  };
  await interaction.reply({ embeds: [cui.bjTableLobbyEmbed(table)], components: cui.bjTableComponents(table) });
  const msg = await interaction.fetchReply();
  table.messageId = msg.id;
  bjTables.set(msg.id, table);
}

async function resolveBjTable(table) {
  const result = BJ.resolvePvp(table.players);
  const pot = table.ante * table.players.length;
  const gagnants = new Set(result.winners);
  if (result.allBust) {
    for (const p of table.players) eco.addBalance(table.guildId, p.userId, table.ante);
  } else {
    const part = Math.floor(pot / result.winners.length);
    for (const uid of result.winners) {
      eco.addBalance(table.guildId, uid, part);
      items.applyWin(table.guildId, uid, part - table.ante);
    }
  }
  // Objets (perte) + mission casino pour chaque joueur
  for (const p of table.players) {
    missions.track(table.guildId, p.userId, 'casino_play', 1);
    if (!result.allBust && !gagnants.has(p.userId)) items.recordLoss(table.guildId, p.userId, table.ante, 'blackjack (table)');
  }
  table.phase = 'done';
  table._result = result;
  bjTables.delete(table.messageId);
  return result;
}

async function onBjTableButton(interaction) {
  const action = interaction.customId.split(':')[1];
  const table = bjTables.get(interaction.message.id);
  if (!table) return priv(interaction, 'Cette table est terminée ou introuvable.');
  const g = table.guildId;
  const userId = interaction.user.id;
  const estAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (action === 'join') {
    if (table.phase !== 'lobby') return priv(interaction, 'Les inscriptions sont closes.');
    if (table.players.some((p) => p.userId === userId)) return priv(interaction, 'Tu es déjà dans la partie.');
    if (eco.getBalance(g, userId) < table.ante) return priv(interaction, `Solde insuffisant (mise ${money(table.ante)}).`);
    eco.addBalance(g, userId, -table.ante);
    table.players.push({ userId, hand: [], status: 'waiting' });
    return interaction.update({ embeds: [cui.bjTableLobbyEmbed(table)], components: cui.bjTableComponents(table) });
  }

  if (action === 'deal') {
    if (table.ownerId !== userId && !estAdmin) return priv(interaction, 'Seul le créateur peut distribuer.');
    if (table.phase !== 'lobby') return priv(interaction, 'La partie a déjà commencé.');
    if (table.players.length < 2) return priv(interaction, 'Il faut au moins 2 joueurs.');
    table.phase = 'playing';
    for (const p of table.players) {
      p.hand = BJ.dealPvpHand();
      p.status = 'playing';
    }
    return interaction.update({ embeds: [cui.bjTableLobbyEmbed(table)], components: cui.bjTableComponents(table) });
  }

  if (action === 'play') {
    if (table.phase !== 'playing') return priv(interaction, "La partie n'est pas en cours.");
    const p = table.players.find((pp) => pp.userId === userId);
    if (!p) return priv(interaction, "Tu n'es pas dans cette partie.");
    const done = p.status === 'done';
    return interaction.reply({
      embeds: [cui.bjHandEmbed(p.hand)],
      components: cui.bjHandComponents(table.messageId, done),
      ephemeral: true,
    });
  }

  if (action === 'resolve') {
    if (table.ownerId !== userId && !estAdmin) return priv(interaction, 'Seul le créateur peut terminer la partie.');
    if (table.phase !== 'playing') return priv(interaction, "La partie n'est pas en cours.");
    await resolveBjTable(table);
    return interaction.update({ embeds: [cui.bjTableResultEmbed(table, table._result)], components: [] });
  }
}

async function onBjHandButton(interaction) {
  const [, action, tableId] = interaction.customId.split(':');
  const table = bjTables.get(tableId);
  if (!table || table.phase !== 'playing') return priv(interaction, 'Cette partie est terminée.');
  const p = table.players.find((pp) => pp.userId === interaction.user.id);
  if (!p) return priv(interaction, "Tu n'es pas dans cette partie.");
  if (p.status === 'done') return priv(interaction, 'Tu as déjà terminé ta main.');

  if (action === 'hit') BJ.hitPvp(p);
  else if (action === 'stand') p.status = 'done';

  const done = p.status === 'done';
  await interaction.update({ embeds: [cui.bjHandEmbed(p.hand)], components: cui.bjHandComponents(table.messageId, done) });

  const tousFinis = table.players.every((pp) => pp.status === 'done');
  try {
    const channel = await client.channels.fetch(table.channelId);
    const msg = await channel.messages.fetch(table.messageId);
    if (tousFinis) {
      await resolveBjTable(table);
      await msg.edit({ embeds: [cui.bjTableResultEmbed(table, table._result)], components: [] });
    } else {
      await msg.edit({ embeds: [cui.bjTableLobbyEmbed(table)], components: cui.bjTableComponents(table) });
    }
  } catch (e) {
    console.error('MAJ table BJ :', e.message);
  }
}

// Applique objets (×2, drops, perte) + mission casino par joueur, à partir
// d'une liste de paris résolus [{userId, amount, total}].
function applyGameOutcomes(guildId, payouts, label) {
  const parJoueur = {};
  for (const p of payouts) {
    parJoueur[p.userId] ??= { mise: 0, rendu: 0 };
    parJoueur[p.userId].mise += p.amount;
    parJoueur[p.userId].rendu += p.total;
  }
  for (const [uid, v] of Object.entries(parJoueur)) {
    const net = v.rendu - v.mise;
    if (net > 0) items.applyWin(guildId, uid, net);
    else if (net < 0) items.recordLoss(guildId, uid, -net, label);
    missions.track(guildId, uid, 'casino_play', 1);
  }
}

// ============ ROULETTE ============

async function onRouletteButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'menu') {
    if (parts[2] === 'odds') return interaction.reply({ embeds: [cui.rouletteOddsEmbed()], ephemeral: true });
    if (parts[2] === 'rules') return interaction.reply({ embeds: [cui.rouletteRulesEmbed()], ephemeral: true });
    // new -> lobby public
    const lobby = { guildId: interaction.guildId, channelId: interaction.channelId, ownerId: interaction.user.id, bets: [], open: true };
    await interaction.reply({ embeds: [cui.rouletteLobbyEmbed(lobby)], components: cui.rouletteComponents(true) });
    const msg = await interaction.fetchReply();
    roulLobbies.set(msg.id, lobby);
    return;
  }

  if (action === 'bet') {
    const lobby = roulLobbies.get(interaction.message.id);
    if (!lobby || !lobby.open) return priv(interaction, 'Cette table est fermée.');
    const extra = [
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('type').setLabel('Type (rouge, noir, pair, plein...)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('numero').setLabel('Numéro (seulement si "plein", 0-36)').setStyle(TextInputStyle.Short).setRequired(false)
      ),
    ];
    return interaction.showModal(miseModal(`roul:betmodal:${interaction.message.id}`, 'Roulette — ta mise', extra));
  }

  if (action === 'spin') {
    const lobby = roulLobbies.get(interaction.message.id);
    if (!lobby || !lobby.open) return priv(interaction, 'Cette table est déjà lancée ou introuvable.');
    if (!canRun(interaction, lobby)) return priv(interaction, 'Seul le créateur (ou un admin) peut lancer la roue.');
    if (lobby.bets.length === 0) return priv(interaction, 'Aucune mise sur la table.');

    lobby.open = false;
    const result = R.spin();
    const payouts = lobby.bets.map((b) => {
      const total = R.resolveBet(b, result);
      if (total > 0) eco.addBalance(lobby.guildId, b.userId, total);
      return { userId: b.userId, amount: b.amount, total };
    });
    applyGameOutcomes(lobby.guildId, payouts, 'roulette');
    await interaction.update({ embeds: [cui.rouletteLobbyEmbed(lobby)], components: [] });
    await interaction.followUp({ embeds: [cui.rouletteResultEmbed(lobby, result, payouts)] });
    roulLobbies.delete(interaction.message.id);
  }
}

async function onRouletteBetModal(interaction) {
  const lobbyId = interaction.customId.split(':')[2];
  const lobby = roulLobbies.get(lobbyId);
  if (!lobby || !lobby.open) return priv(interaction, 'Cette table est fermée.');

  const g = interaction.guildId;
  const userId = interaction.user.id;
  const type = interaction.fields.getTextInputValue('type').trim().toLowerCase();
  const def = R.BET_TYPES[type];
  if (!def) return priv(interaction, `Type inconnu : \`${type}\`. Vois les cotes pour la liste.`);

  let number = null;
  if (def.needsNumber) {
    number = parseInt(interaction.fields.getTextInputValue('numero'), 10);
    if (!Number.isInteger(number) || number < 0 || number > 36) {
      return priv(interaction, 'Pour un numéro plein, indique un numéro entre 0 et 36.');
    }
  }

  const { montant, err } = parseMise(interaction.fields.getTextInputValue('mise'), eco.getBalance(g, userId));
  if (err) return priv(interaction, err);

  eco.addBalance(g, userId, -montant);
  lobby.bets.push({ userId, type, number, amount: montant });

  try {
    const channel = await client.channels.fetch(lobby.channelId);
    const msg = await channel.messages.fetch(lobbyId);
    await msg.edit({ embeds: [cui.rouletteLobbyEmbed(lobby)], components: cui.rouletteComponents(true) });
  } catch (e) {
    console.error('MAJ lobby roulette :', e.message);
  }

  const nom = def.needsNumber ? `${def.label} ${number}` : def.label;
  return priv(interaction, `✅ Mise de ${money(montant)} sur **${nom}** enregistrée.`);
}

// ============ COURSE DE CHEVAUX ============

async function onHorseButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'menu') {
    if (parts[2] === 'odds') return interaction.reply({ embeds: [cui.horseOddsEmbed()], ephemeral: true });
    if (parts[2] === 'rules') return interaction.reply({ embeds: [cui.horseRulesEmbed()], ephemeral: true });
    const lobby = { guildId: interaction.guildId, channelId: interaction.channelId, ownerId: interaction.user.id, race: H.makeRace(), bets: [], open: true };
    await interaction.reply({ embeds: [cui.horseLobbyEmbed(lobby)], components: cui.horseComponents(true) });
    const msg = await interaction.fetchReply();
    horseLobbies.set(msg.id, lobby);
    return;
  }

  if (action === 'bet') {
    const lobby = horseLobbies.get(interaction.message.id);
    if (!lobby || !lobby.open) return priv(interaction, 'Cette course est fermée.');
    const extra = [
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('cheval').setLabel('Numéro du cheval (1 à 4)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
    ];
    return interaction.showModal(miseModal(`horse:betmodal:${interaction.message.id}`, 'Course — ton pari', extra));
  }

  if (action === 'run') {
    const lobby = horseLobbies.get(interaction.message.id);
    if (!lobby || !lobby.open) return priv(interaction, 'Cette course est déjà lancée ou introuvable.');
    if (!canRun(interaction, lobby)) return priv(interaction, 'Seul le créateur (ou un admin) peut lancer la course.');
    if (lobby.bets.length === 0) return priv(interaction, 'Aucun pari sur la course.');

    lobby.open = false;
    const winner = H.runRace(lobby.race);
    const payouts = lobby.bets.map((b) => {
      const gagne = b.horse === winner;
      const cote = lobby.race.horses[b.horse].cote;
      const total = gagne ? Math.floor(b.amount * cote) : 0;
      if (total > 0) eco.addBalance(lobby.guildId, b.userId, total);
      return { userId: b.userId, amount: b.amount, total, cote };
    });
    applyGameOutcomes(lobby.guildId, payouts, 'course');
    for (const p of payouts) if (p.total > 0) missions.track(lobby.guildId, p.userId, 'race_win', 1);
    await interaction.update({ embeds: [cui.horseLobbyEmbed(lobby)], components: [] });
    await interaction.followUp({ embeds: [cui.horseResultEmbed(lobby, winner, payouts)] });
    horseLobbies.delete(interaction.message.id);
  }
}

async function onHorseBetModal(interaction) {
  const lobbyId = interaction.customId.split(':')[2];
  const lobby = horseLobbies.get(lobbyId);
  if (!lobby || !lobby.open) return priv(interaction, 'Cette course est fermée.');

  const g = interaction.guildId;
  const userId = interaction.user.id;
  const chevalNum = parseInt(interaction.fields.getTextInputValue('cheval'), 10);
  if (!Number.isInteger(chevalNum) || chevalNum < 1 || chevalNum > 4) {
    return priv(interaction, 'Choisis un cheval entre 1 et 4.');
  }
  const horse = chevalNum - 1;

  const { montant, err } = parseMise(interaction.fields.getTextInputValue('mise'), eco.getBalance(g, userId));
  if (err) return priv(interaction, err);

  eco.addBalance(g, userId, -montant);
  lobby.bets.push({ userId, horse, amount: montant });

  try {
    const channel = await client.channels.fetch(lobby.channelId);
    const msg = await channel.messages.fetch(lobbyId);
    await msg.edit({ embeds: [cui.horseLobbyEmbed(lobby)], components: cui.horseComponents(true) });
  } catch (e) {
    console.error('MAJ lobby course :', e.message);
  }

  return priv(interaction, `✅ Pari de ${money(montant)} sur **${lobby.race.horses[horse].nom}** enregistré.`);
}

// ============ COMMANDES : PARIS ============

// ============ COMMANDES : PARIS ============

async function cmdPari(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'creer') return await pariCreer(interaction);
  if (sub === 'liste') return await pariListe(interaction);
}

async function pariCreer(interaction) {
  const titre = interaction.options.getString('titre');

  const brut = [];
  for (let i = 1; i <= 20; i++) {
    const v = interaction.options.getString(`issue_${i}`);
    if (v && v.trim()) brut.push(v.trim());
  }
  const options = [...new Set(brut)];
  if (options.length < 2) return priv(interaction, 'Il faut au moins **2 issues différentes**.');

  const bet = B.createBet({
    title: titre,
    options,
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
  });

  await interaction.reply({ embeds: [ui.betEmbed(bet)], components: ui.betComponents(bet) });
  const msg = await interaction.fetchReply();
  B.setBetMessage(bet, msg.channelId, msg.id);
}

async function pariListe(interaction) {
  const g = interaction.guildId;
  const ouverts = B.listBets(g, 'open');
  const verrous = B.listBets(g, 'closed');

  if (!ouverts.length && !verrous.length) {
    return interaction.reply('Aucun pari en cours. Lance-en un avec `/pari creer` !');
  }

  const fmt = (b) =>
    `**#${b.id}** — ${b.title} (${b.status === 'open' ? '🟢 ouvert' : '🔒 verrouillé'}, cagnotte ${money(B.totalPool(b))})`;

  return interaction.reply({
    embeds: [
      {
        title: '📋 Paris en cours',
        description: [...ouverts, ...verrous].map(fmt).join('\n'),
        color: 0x2ecc71,
      },
    ],
  });
}

client.login(config.token);
