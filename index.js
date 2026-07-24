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
import { ensureUser } from './store.js';
import * as eco from './economy.js';
import * as L from './levels.js';
import * as B from './bets.js';
import * as ui from './ui.js';
import { startScheduler } from './scheduler.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`   Monnaie : ${config.currencyName} (${config.currencySymbol})`);
  console.log(`   Serveurs : ${c.guilds.cache.size}`);
  startScheduler(client);
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

    if (interaction.isButton()) return await onButton(interaction);
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
    const h = Math.floor(res.remaining / 3_600_000);
    const m = Math.floor((res.remaining % 3_600_000) / 60_000);
    return priv(interaction, `⏳ Déjà récupéré ! Reviens dans **${h}h ${m}min**.`);
  }

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
