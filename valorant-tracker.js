import { config } from './config.js';
import { getSettings, getData, save } from './store.js';
import { createValorantApi, valorantRows, valorantStatsEmbed, valorantHistoryEmbed,
  valorantMatchEmbed, pollValorantPlayer } from './valorant-api.js';

const api = createValorantApi({ key: config.henrikApiKey });
const reply = (i, content) => i.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

export async function runValorantCommand(i, options) {
  const sub = options.getSubcommand();
  const st = getSettings(i.guildId).tracker;
  const players = st.valorant.players;
  const player = players[i.user.id];
  if (sub === 'delier') {
    delete players[i.user.id]; save(); return reply(i, 'Compte Valorant dissocié et suivi arrêté sur ce serveur.');
  }
  if (sub === 'desactiver') {
    if (!player) return reply(i, 'Lie ton compte via `/tracker menu` → Valorant → Lier mon compte.');
    player.enabled = false; save(); return reply(i, 'Suivi Valorant mis en pause.');
  }
  if (!config.henrikApiKey) return reply(i, 'Configure HENRIK_API_KEY dans le .env du droplet, puis redémarre le bot.');
  if (sub === 'lier') {
    if (!options.getBoolean('consentement')) return reply(i, 'La publication des résultats nécessite ton consentement.');
    if (!st.channelId) return reply(i, 'Un administrateur doit définir `/tracker salon` avant de lier un compte.');
    const riotId = options.getString('riot-id').trim();
    const pos = riotId.lastIndexOf('#');
    if (pos <= 0 || pos === riotId.length - 1) return reply(i, 'Utilise le format Pseudo#TAG.');
    await i.deferReply({ ephemeral: true });
    // HenrikDev fournit l'identifiant Valorant utilisé par ses propres routes.
    const account = await api.account(riotId.slice(0, pos), riotId.slice(pos + 1));
    const rows = valorantRows(await api.matches(account.puuid, 10), account.puuid);
    players[i.user.id] = { discordId: i.user.id, puuid: account.puuid,
      riotId: `${account.name}#${account.tag}`, enabled: true, linkedAt: Date.now(), seen: rows.map((r) => r.id) };
    save();
    return i.editReply(`Compte Valorant Europe/PC associé : ${players[i.user.id].riotId}.\nLes nouvelles parties commencées après cette liaison seront annoncées après leur fin, dès leur disponibilité.\nTu déclares que ce compte est le tien et acceptes la publication de ses résultats. L’association ne vérifie pas la propriété par connexion Riot.\nCe suivi utilise HenrikDev, un service tiers non officiel, et n’est pas approuvé par Riot Games. Riot Games et ses propriétés sont des marques de Riot Games, Inc.`);
  }
  if (!player) return reply(i, 'Lie ton compte via `/tracker menu` → Valorant → Lier mon compte.');
  if (sub === 'activer') {
    if (!st.channelId) return reply(i, 'Un administrateur doit définir `/tracker salon`.');
    await i.deferReply({ ephemeral: true });
    const rows = valorantRows(await api.matches(player.puuid, 10), player.puuid);
    if (players[i.user.id] !== player) return i.editReply('Le compte a changé, réessaie.');
    player.seen = rows.map((r) => r.id); player.linkedAt = Date.now(); player.enabled = true; save();
    return i.editReply('Suivi Valorant activé pour les prochaines parties.');
  }
  if (sub === 'statut') return reply(i, `Compte Valorant : ${player.riotId} (Europe/PC)\nSuivi : ${player.enabled ? 'activé' : 'désactivé'}\nSalon : ${st.channelId ? `<#${st.channelId}>` : 'non configuré'}\nLe suivi récupère les matchs terminés ; il ne détecte pas les parties en cours.`);
  await i.deferReply({ ephemeral: false });
  const count = options.getInteger?.('nombre') ?? (sub === 'stats' ? 20 : sub === 'historique' ? 5 : 1);
  const rows = valorantRows(await api.matches(player.puuid, count), player.puuid);
  if (sub === 'stats') {
    let rank = null; let warning = '';
    try { rank = await api.rank(player.puuid); }
    catch (err) { warning = `\nClassement indisponible : ${err.message}`; }
    const embed = valorantStatsEmbed(rows, rank, player.riotId, count);
    embed.description += warning;
    return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
  if (!rows.length) return i.editReply('Aucune partie Valorant disponible pour ce compte Europe/PC.');
  return i.editReply({ embeds: [sub === 'historique' ? valorantHistoryEmbed(rows, player.riotId)
    : valorantMatchEmbed(rows[0], player.riotId)], allowedMentions: { parse: [] } });
}

export function startValorantTracker(client) {
  if (!config.henrikApiKey) { console.log('Suivi Valorant inactif : HENRIK_API_KEY non configurée.'); return; }
  let lastError = '';
  async function tick() {
    const cache = new Map();
    try {
      for (const guildId of Object.keys(getData().guilds)) {
        const st = getSettings(guildId).tracker;
        if (!st.channelId) continue;
        const players = Object.values(st.valorant.players).filter((p) => p.enabled);
        if (!players.length) continue;
        const channel = await client.channels.fetch(st.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        for (const player of players) {
          try {
            await pollValorantPlayer({ api: { matches: async (puuid) => {
              if (!cache.has(puuid)) cache.set(puuid, await api.matches(puuid, 10));
              return cache.get(puuid);
            } }, player, persist: save,
            isCurrent: () => st.valorant.players[player.discordId] === player && player.enabled,
            send: (payload) => channel.send({ ...payload, allowedMentions: { parse: [] } }),
            });
          } catch (err) {
            if (lastError !== err.message) console.error('Suivi Valorant :', err.message);
            lastError = err.message;
          }
        }
      }
    } catch (err) { console.error('Suivi Valorant :', err.message); }
    finally { setTimeout(tick, 120000).unref(); }
  }
  void tick();
}
