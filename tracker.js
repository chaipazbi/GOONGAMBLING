import { PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';
import { getSettings, getData, save } from './store.js';
import { createRiotApi, matchEmbed, pollPlayer } from './riot-api.js';
import { statsEmbed, historyEmbed } from './tracker-stats.js';

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
  try { return await runTrackerCommand(i); }
  catch (err) {
    const content = err.message;
    if (i.deferred) return i.editReply({ content, allowedMentions: { parse: [] } });
    return reply(i, content);
  }
}

async function runTrackerCommand(i) {
  const sub = i.options.getSubcommand();
  const st = getSettings(i.guildId).tracker;
  if (sub === 'salon') {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(i, 'Permission Gérer le serveur requise.');
    const ch = i.options.getChannel('salon');
    const me = i.guild.members.me ?? await i.guild.members.fetchMe();
    const permissions = ch.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return reply(i, 'Le bot doit pouvoir voir ce salon, envoyer des messages et intégrer des liens.');
    }
    st.channelId = ch.id;
    save();
    return reply(i, `Salon du suivi LoL : <#${ch.id}>.`);
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
    if (!i.options.getBoolean('consentement')) return reply(i, 'Le suivi nécessite ton consentement. Aucun compte associé.');
    if (!st.channelId) return reply(i, 'Un administrateur doit définir `/tracker salon` avant de lier un compte.');
    const riotId = i.options.getString('riot-id').trim();
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
  await i.deferReply({ ephemeral: true });
  if (sub === 'stats' || sub === 'historique') {
    const count = i.options.getInteger('nombre') ?? (sub === 'stats' ? 20 : 5);
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
  if (!config.riotApiKey) {
    console.log('Suivi LoL inactif : RIOT_API_KEY non configurée.');
    return;
  }
  let lastError = '';
  async function tick() {
    try {
      for (const guildId of Object.keys(getData().guilds)) {
        const st = getSettings(guildId).tracker;
        if (!st.channelId || !Object.values(st.players).some((p) => p.enabled)) continue;
        const channel = await client.channels.fetch(st.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        for (const player of Object.values(st.players)) {
          if (!player.enabled) continue;
          try {
            await pollPlayer({ api, player, persist: save,
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
