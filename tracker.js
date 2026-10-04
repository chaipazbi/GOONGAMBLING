import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { config } from './config.js';
import { getSettings, getData, save } from './store.js';
import { createRiotApi, matchEmbed, pollPlayer } from './riot-api.js';
import { statsEmbed, historyEmbed } from './tracker-stats.js';
import { createTrackerBets } from './tracker-bets.js';
import * as bets from './bets.js';
import * as ui from './ui.js';
import * as items from './items.js';
import * as missions from './missions.js';
import { runValorantCommand, startValorantTracker } from './valorant-tracker.js';

const api = createRiotApi({ key: config.riotApiKey });
// Cache temporaire et borné pour les consultations répétées de résultats immuables.
const matchCache = new Map();
async function recentMatches(puuid, count) {
  const ids = await api.history(puuid, count);
  const matches = [];
  for (const id of ids) {
    let match = matchCache.get(id);
    if (!match) {
      match = await api.match(id);
      if (match) {
        matchCache.set(id, match);
        if (matchCache.size > 300) matchCache.delete(matchCache.keys().next().value);
      }
    }
    if (match) matches.push(match);
  }
  return matches;
}
const disclaimer = 'Ce suivi n’est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games. Riot Games et ses propriétés sont des marques de Riot Games, Inc.';
const reply = (i, content) => i.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

export async function handleTracker(i) {
  try { return await runTrackerCommand(i, i.options, i.options.getString('jeu') || 'lol'); }
  catch (err) {
    const content = err.message;
    if (i.deferred) return i.editReply({ content, allowedMentions: { parse: [] } });
    return reply(i, content);
  }
}

async function runTrackerCommand(i, options = i.options, game = 'lol') {
  const sub = options.getSubcommand();
  if (sub === 'menu') return replyMenu(i);
  if (game === 'valorant' && sub !== 'salon') return runValorantCommand(i, options, api);
  const st = getSettings(i.guildId).tracker;
  if (sub === 'salon') {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(i, 'Permission Gérer le serveur requise.');
    const ch = options.getChannel('salon');
    const me = i.guild.members.me ?? await i.guild.members.fetchMe();
    const permissions = ch.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return reply(i, 'Le bot doit pouvoir voir ce salon, envoyer des messages et intégrer des liens.');
    }
    st.channelId = ch.id;
    save();
    return reply(i, `Salon du suivi LoL et Valorant : <#${ch.id}>.`);
  }
  if (sub === 'delier') {
    delete st.players[i.user.id];
    save();
    return reply(i, 'Compte dissocié et suivi arrêté sur ce serveur.');
  }
  const player = st.players[i.user.id];
  if (sub === 'desactiver' || sub === 'activer') {
    if (!player) return reply(i, 'Associe d’abord ton compte avec `/tracker lier`.');
    if (sub === 'activer' && !st.channelId) return reply(i, 'Un administrateur doit définir `/tracker salon`.');
    if (sub === 'desactiver') {
      player.enabled = false;
      save();
      return reply(i, 'Suivi désactivé.');
    }
    await i.deferReply({ ephemeral: true });
    // Écarter les parties jouées pendant la pause, sans modifier l’état si Riot échoue.
    const seen = await api.history(player.puuid);
    if (st.players[i.user.id] !== player) return i.editReply('Le compte a changé, réessaie.');
    player.seen = seen;
    player.linkedAt = Date.now();
    player.announcedGame = null;
    player.enabled = true;
    save();
    return i.editReply('Suivi activé.');
  }
  if (!config.riotApiKey) return reply(i, 'Configure RIOT_API_KEY dans le .env du bot, puis redémarre-le.');
  if (sub === 'lier') {
    if (!options.getBoolean('consentement')) return reply(i, 'Le suivi nécessite ton consentement. Aucun compte associé.');
    if (!st.channelId) return reply(i, 'Un administrateur doit définir `/tracker salon` avant de lier un compte.');
    const riotId = options.getString('riot-id').trim();
    const separator = riotId.lastIndexOf('#');
    if (separator <= 0 || separator === riotId.length - 1) return reply(i, 'Utilise le format Pseudo#TAG.');
    await i.deferReply({ ephemeral: true });
    const account = await api.account(riotId.slice(0, separator), riotId.slice(separator + 1));
    await api.summoner(account.puuid); // Vérifie que le compte LoL existe sur EUW.
    const seen = await api.history(account.puuid);
    st.players[i.user.id] = {
      discordId: i.user.id, puuid: account.puuid,
      riotId: `${account.gameName}#${account.tagLine}`, enabled: true,
      linkedAt: Date.now(), seen, announcedGame: null,
    };
    save();
    return i.editReply(`Compte LoL EUW associé : ${st.players[i.user.id].riotId}.\nTu déclares que ce compte est le tien et acceptes que ses résultats soient publiés dans le salon configuré. Cette association ne vérifie pas la propriété par connexion Riot.\n${disclaimer}`);
  }
  if (!player) return reply(i, 'Associe d’abord ton compte avec `/tracker lier`.');
  await i.deferReply({ ephemeral: !['stats', 'historique', 'derniere-partie'].includes(sub) });
  if (sub === 'stats' || sub === 'historique') {
    const count = options.getInteger('nombre') ?? (sub === 'stats' ? 20 : 5);
    const matches = await recentMatches(player.puuid, count);
    if (!matches.length) return i.editReply('Aucune partie récente disponible.');
    const embed = sub === 'stats'
      ? statsEmbed(matches, player.puuid, player.riotId, count)
      : historyEmbed(matches, player.puuid, player.riotId, count);
    return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
  if (sub === 'derniere-partie') {
    const ids = await api.history(player.puuid);
    if (!ids.length) return i.editReply('Aucune partie récente disponible.');
    const match = await api.match(ids[0]);
    if (!match) return i.editReply('Résultat pas encore disponible.');
    return i.editReply({ embeds: [matchEmbed(match, player.puuid, player.riotId)] });
  }
  if (sub === 'statut') {
    const game = await api.active(player.puuid);
    return i.editReply(`Compte : ${player.riotId} (EUW)\nSuivi : ${player.enabled ? 'activé' : 'désactivé'}\nPartie : ${game ? 'en cours' : 'aucune détectée'}\nSalon : ${st.channelId ? `<#${st.channelId}>` : 'non configuré'}`);
  }
}

export function startTracker(client) {
  startValorantTracker(client);
  if (!config.riotApiKey) {
    console.log('Suivi LoL inactif : RIOT_API_KEY non configurée.');
    return;
  }
  const automatic = createTrackerBets({ bets, ui, persist: save, botId: () => client.user.id,
    applySettlement: (bet) => {
      for (const e of bet.settlement.entries) {
        if (e.kind === 'win') {
          items.applyWin(bet.guildId, e.userId, e.net); items.applyXp(bet.guildId, e.userId, e.xp);
          missions.track(bet.guildId, e.userId, 'bet_win', 1);
        } else if (e.kind === 'lose') items.recordLoss(bet.guildId, e.userId, e.stake, 'pari');
      }
    },
  });
  // La fermeture des mises ne dépend pas de la disponibilité de Riot.
  setInterval(() => {
    try { for (const guildId of Object.keys(getData().guilds)) automatic.closeExpired(guildId); }
    catch (err) { console.error('Fermeture des paris suivis :', err.message); }
  }, 1000).unref();
  let lastError = '';
  async function tick() {
    try {
      for (const guildId of Object.keys(getData().guilds)) {
        try { await automatic.sync(guildId, client, api); }
        catch (err) { if (err.message !== lastError) console.error('Paris LoL :', err.message); lastError = err.message; }
        const st = getSettings(guildId).tracker;
        if (!st.channelId || !Object.values(st.players).some((p) => p.enabled)) continue;
        const channel = await client.channels.fetch(st.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        for (const player of Object.values(st.players)) {
          if (!player.enabled) continue;
          try {
            await pollPlayer({ api, player, persist: save,
              onStart: (game, matchId) => automatic.start(guildId, player, game, matchId, channel),
              isCurrent: () => st.players[player.discordId] === player && player.enabled,
              send: (payload) => channel.send({ ...payload, allowedMentions: { parse: [] } }),
            });
          } catch (err) {
            // N’affiche jamais la requête, le token ou les données d’authentification.
            if (err.message !== lastError) console.error('Suivi LoL :', err.message);
            lastError = err.message;
          }
        }
      }
    } catch (err) { console.error('Suivi LoL :', err.message); }
    finally { setTimeout(tick, 60000).unref(); }
  }
  void tick();
}

function gameRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tracker:game:lol:${userId}`).setLabel('League of Legends').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tracker:game:valorant:${userId}`).setLabel('Valorant').setStyle(ButtonStyle.Danger),
  );
}

function replyMenu(i) {
  return i.reply({ content: 'Choisis le jeu à suivre.', ephemeral: true, components: [gameRow(i.user.id)] });
}

function actionRows(userId, game = 'lol') {
  const actions = [['stats', 'Statistiques'], ['historique', 'Historique'], ['derniere-partie', 'Dernière partie'],
    ['statut', game === 'valorant' ? 'État du suivi' : 'Partie en cours'], ['lier', 'Lier mon compte'], ['activer', 'Activer le suivi'],
    ['desactiver', 'Mettre en pause'], ['delier', 'Délier mon compte'], ['retour', 'Choisir un autre jeu']];
  const rows = [];
  for (let n = 0; n < actions.length; n += 5) rows.push(new ActionRowBuilder().addComponents(
    ...actions.slice(n, n + 5).map(([action, label]) => new ButtonBuilder()
      .setCustomId(`tracker:action:${game}.${action}:${userId}`).setLabel(label).setStyle(ButtonStyle.Secondary))));
  return rows;
}

export async function handleTrackerButton(i) {
  const [, type, value, owner] = i.customId.split(':');
  if (owner !== i.user.id) return reply(i, 'Ouvre ton propre menu avec `/tracker menu`.');
  if (type === 'game' && value === 'rl') return reply(i, 'Rocket League n’est pas disponible dans cette version.');
  if (type === 'game' && ['lol', 'valorant'].includes(value)) return i.update({
    content: `${value === 'lol' ? 'League of Legends' : 'Valorant'} — choisis une action. Les statistiques et résultats consultés seront visibles dans ce salon.`,
    components: actionRows(i.user.id, value),
  });
  if (type !== 'action') return;
  // Accepte également les anciens boutons LoL envoyés avant la mise à jour.
  const [game, action] = value.includes('.') ? value.split('.') : ['lol', value];
  if (!['lol', 'valorant'].includes(game)) return reply(i, 'Jeu inconnu.');
  if (action === 'retour') return i.update({ content: 'Choisis le jeu à suivre.', components: [gameRow(i.user.id)] });
  if (action === 'lier') {
    const modal = new ModalBuilder().setCustomId(`tracker:link-${game}:${i.user.id}`)
      .setTitle(game === 'valorant' ? 'Lier mon compte Valorant Europe/PC' : 'Lier mon compte LoL EUW');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('riot-id').setLabel('Ton Riot ID : Pseudo#TAG').setMaxLength(100).setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('consent').setLabel('Mon compte, publication acceptée : écrire OUI').setMaxLength(3).setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return i.showModal(modal);
  }
  if (!['stats', 'historique', 'derniere-partie', 'statut', 'activer', 'desactiver', 'delier'].includes(action)) return;
  try { return await runTrackerCommand(i, { getSubcommand: () => action, getInteger: () => null }, game); }
  catch (err) {
    if (i.deferred) return i.editReply({ content: err.message, allowedMentions: { parse: [] } });
    return reply(i, err.message);
  }
}

export async function handleTrackerModal(i) {
  const [, action, owner] = i.customId.split(':');
  if (owner !== i.user.id || !['link', 'link-lol', 'link-valorant'].includes(action)) return reply(i, 'Formulaire invalide.');
  const game = action === 'link-valorant' ? 'valorant' : 'lol';
  const consent = i.fields.getTextInputValue('consent').trim().toUpperCase() === 'OUI';
  try { return await runTrackerCommand(i, { getSubcommand: () => 'lier', getBoolean: () => consent,
    getString: () => i.fields.getTextInputValue('riot-id') }, game); }
  catch (err) {
    if (i.deferred) return i.editReply({ content: err.message, allowedMentions: { parse: [] } });
    return reply(i, err.message);
  }
}
