const number = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const ratio = (a, b) => b ? number(a / b) : a ? '∞ (aucune mort)' : '0';
const remake = (info, player) => info.gameDuration < 300 && player.gameEndedInEarlySurrender;
const queueName = (info) => ({ 420: 'Classée solo/duo', 440: 'Classée flex', 450: 'ARAM',
  400: 'Normal draft', 490: 'Partie rapide' }[info.queueId] || info.gameMode || 'Autre mode');

export function playerRows(matches, puuid) {
  return matches.flatMap((match) => {
    const p = match.info?.participants?.find((entry) => entry.puuid === puuid);
    return p ? [{ info: match.info, p, id: match.metadata.matchId }] : [];
  });
}

export function summarize(matches, puuid) {
  const rows = playerRows(matches, puuid);
  const played = rows.filter(({ info, p }) => !remake(info, p));
  const result = { total: played.length, remakes: rows.length - played.length,
    wins: 0, kills: 0, deaths: 0, assists: 0, champions: [] };
  const champions = new Map();
  for (const { p } of played) {
    result.wins += p.win ? 1 : 0;
    result.kills += p.kills || 0;
    result.deaths += p.deaths || 0;
    result.assists += p.assists || 0;
    const name = p.championName || 'Inconnu';
    const c = champions.get(name) || { name, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    c.games++; c.wins += p.win ? 1 : 0;
    c.kills += p.kills || 0; c.deaths += p.deaths || 0; c.assists += p.assists || 0;
    champions.set(name, c);
  }
  result.champions = [...champions.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  return result;
}

export function statsEmbed(matches, puuid, riotId, requested) {
  const s = summarize(matches, puuid);
  return {
    title: `LoL — statistiques de ${riotId}`, color: 0x3498db,
    description: `Analyse des **${s.total} parties récentes disponibles**, tous modes confondus.\n${s.remakes} remake(s) exclu(s). Ces chiffres ne couvrent pas toute la carrière.`,
    fields: [
      { name: 'Victoires / Défaites', value: `${s.wins} / ${s.total - s.wins}`, inline: true },
      { name: 'Taux de victoire', value: s.total ? `${number(100 * s.wins / s.total)} %` : '—', inline: true },
      { name: 'K/D (kills ÷ morts)', value: ratio(s.kills, s.deaths), inline: true },
      { name: 'KDA ((kills + assists) ÷ morts)', value: ratio(s.kills + s.assists, s.deaths), inline: true },
      { name: 'K / D / A moyens par partie', value: s.total ? `${number(s.kills / s.total)} / ${number(s.deaths / s.total)} / ${number(s.assists / s.total)}` : '—', inline: true },
      { name: 'Kills / Morts / Assists au total', value: `${s.kills} / ${s.deaths} / ${s.assists}`, inline: true },
      { name: 'Champions les plus joués dans cet échantillon', value: s.champions.slice(0, 5).map((c, i) =>
        `${i + 1}. **${c.name}** — ${c.games} partie(s), ${number(100 * c.wins / c.games)} % de victoires, K/D ${ratio(c.kills, c.deaths)}`
      ).join('\n') || 'Aucune partie hors remake.' },
    ],
    footer: { text: `${requested} dernières parties demandées • Données Riot Games • EUW` },
  };
}

export function historyEmbed(matches, puuid, riotId, requested) {
  const rows = playerRows(matches, puuid).slice(0, 10);
  return {
    title: `LoL — historique de ${riotId}`, color: 0x3498db,
    description: 'Parties les plus récentes en premier, tous modes confondus.',
    fields: rows.map(({ info, p, id }) => {
      const timestamp = info.gameEndTimestamp ?? info.gameStartTimestamp + info.gameDuration * 1000;
      return {
        name: `${remake(info, p) ? '⚪ Remake' : p.win ? '🟢 Victoire' : '🔴 Défaite'} — ${p.championName || 'Inconnu'}`,
        value: `${queueName(info)} • ${Math.floor(info.gameDuration / 60)} min • <t:${Math.floor(timestamp / 1000)}:R>\n**${p.kills || 0} / ${p.deaths || 0} / ${p.assists || 0}** K/D/A • Match ${id}`,
      };
    }),
    footer: { text: `${rows.length}/${requested} résultats disponibles • Données Riot Games • EUW` },
  };
}
