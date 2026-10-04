// Appels Riot sérialisés : marge sous 100 requêtes / 2 minutes.
export function createRiotApi({ key, fetchImpl = globalThis.fetch, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let queue = Promise.resolve();
  let nextRequest = 0;
  let blockedUntil = 0;
  let denied = false;
  function request(host, path, { optional = false } = {}) {
    const work = queue.then(async () => {
      if (!key) throw new Error('RIOT_API_KEY manque dans le fichier .env.');
      if (denied) throw new Error('Accès Riot refusé : vérifie ou renouvelle RIOT_API_KEY, puis redémarre le bot.');
      if (now() < blockedUntil) throw new Error('Limite Riot atteinte : le suivi reprendra après le délai imposé.');
      await sleep(Math.max(0, nextRequest - now()));
      nextRequest = now() + 1300;
      let response;
      try {
        response = await fetchImpl(`https://${host}.api.riotgames.com${path}`, {
          headers: { 'X-Riot-Token': key }, signal: AbortSignal.timeout(15000),
        });
      } catch { throw new Error('Riot est temporairement inaccessible.'); }
      if (response.status === 404 && optional) return null;
      if (response.status === 401 || response.status === 403) {
        denied = true;
        throw new Error('Accès Riot refusé : vérifie ou renouvelle RIOT_API_KEY, puis redémarre le bot.');
      }
      if (response.status === 429) {
        const delay = Number(response.headers.get('retry-after'));
        blockedUntil = now() + (Number.isFinite(delay) && delay > 0 ? delay : 120) * 1000;
        throw new Error('Limite Riot atteinte : le suivi reprendra après le délai imposé.');
      }
      if (!response.ok) throw new Error(`Réponse Riot ${response.status}. Réessaie plus tard.`);
      return response.json();
    });
    queue = work.catch(() => {});
    return work;
  }
  const encode = encodeURIComponent;
  return {
    account: (name, tag) => request('europe', `/riot/account/v1/accounts/by-riot-id/${encode(name)}/${encode(tag)}`),
    summoner: (id) => request('euw1', `/lol/summoner/v4/summoners/by-puuid/${encode(id)}`),
    active: (id) => request('euw1', `/lol/spectator/v5/active-games/by-summoner/${encode(id)}`, { optional: true }),
    history: (id) => request('europe', `/lol/match/v5/matches/by-puuid/${encode(id)}/ids?count=10`),
    match: (id) => request('europe', `/lol/match/v5/matches/${encode(id)}`, { optional: true }),
  };
}

export function matchEmbed(match, puuid, riotId) {
  const info = match.info;
  const player = info?.participants?.find((p) => p.puuid === puuid);
  if (!player) throw new Error('Joueur absent du résultat Riot.');
  const remake = info.gameDuration < 300 && player.gameEndedInEarlySurrender;
  return {
    title: `LoL — ${riotId} : ${remake ? 'partie écourtée' : player.win ? 'victoire' : 'défaite'}`,
    color: remake ? 0x95a5a6 : player.win ? 0x2ecc71 : 0xe74c3c,
    fields: [
      { name: 'Champion', value: player.championName || 'Inconnu', inline: true },
      { name: 'Kills / Morts / Assists', value: `${player.kills ?? 0} / ${player.deaths ?? 0} / ${player.assists ?? 0}`, inline: true },
      { name: 'Durée', value: `${Math.floor(info.gameDuration / 60)} min`, inline: true },
      { name: 'Mode', value: info.gameMode || 'Inconnu', inline: true },
      { name: 'Farm', value: String((player.totalMinionsKilled || 0) + (player.neutralMinionsKilled || 0)), inline: true },
    ],
    footer: { text: `Match ${match.metadata.matchId} • Données Riot Games` },
  };
}

// État persisté fourni par le stockage du bot ; aucun état de jeu perdu au redémarrage.
export async function pollPlayer({ api, player, send, persist, isCurrent = () => true }) {
  const active = await api.active(player.puuid);
  if (!isCurrent()) return;
  const activeId = active ? `EUW1_${active.gameId}` : null;
  if (activeId && !player.seen.includes(activeId) && player.announcedGame !== activeId) {
    await send({ content: `<@${player.discordId}> (${player.riotId}) joue une partie LoL !`, embeds: [{
      title: 'Partie en cours', color: 0x3498db,
      description: `Mode : ${active.gameMode || 'Inconnu'}\nLa détection peut arriver après le début du match.`,
      footer: { text: activeId },
    }] });
    if (!isCurrent()) return;
    player.announcedGame = activeId;
    persist();
  }
  const ids = await api.history(player.puuid);
  for (const id of [...ids].reverse()) {
    if (!isCurrent()) return;
    if (player.seen.includes(id)) continue;
    const match = await api.match(id);
    if (!match) continue; // Résultat pas encore publié : réessayer au prochain passage.
    if (!isCurrent()) return;
    const ended = match.info.gameEndTimestamp ?? match.info.gameStartTimestamp + match.info.gameDuration * 1000;
    if (ended >= player.linkedAt) {
      await send({ content: `Partie terminée pour <@${player.discordId}>`, embeds: [matchEmbed(match, player.puuid, player.riotId)] });
      if (!isCurrent()) return;
    }
    player.seen.push(id);
    player.seen = player.seen.slice(-100);
    persist();
  }
}
