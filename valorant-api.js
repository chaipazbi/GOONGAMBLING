// HenrikDev : API tierce, sans mot de passe ni token de session Riot du joueur.
export function createValorantApi({ key, fetchImpl = globalThis.fetch, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let queue = Promise.resolve(); let next = 0; let blocked = 0; let denied = false;
  function request(path, optional = false) {
    const work = queue.then(async () => {
      if (!key) throw new Error('Configure HENRIK_API_KEY dans le .env, puis redémarre le bot.');
      if (denied) throw new Error('Clé HenrikDev refusée : vérifie HENRIK_API_KEY et redémarre le bot.');
      if (now() < blocked) throw new Error('Limite HenrikDev atteinte : réessaie après le délai imposé.');
      await sleep(Math.max(0, next - now())); next = now() + 2100;
      let response;
      try { response = await fetchImpl(`https://api.henrikdev.xyz${path}`, {
        headers: { Authorization: key }, signal: AbortSignal.timeout(20000),
      }); } catch { throw new Error('HenrikDev est temporairement inaccessible.'); }
      if (response.status === 401 || response.status === 403) {
        denied = true; throw new Error('Clé HenrikDev refusée : vérifie HENRIK_API_KEY et redémarre le bot.');
      }
      if (response.status === 429) {
        const delay = Number(response.headers.get('retry-after'));
        blocked = now() + (Number.isFinite(delay) && delay > 0 ? delay : 60) * 1000;
        throw new Error('Limite HenrikDev atteinte : réessaie après le délai imposé.');
      }
      if (optional && response.status === 404) return null;
      if (!response.ok) {
        // Afficher le motif du fournisseur, sans sa réponse brute ni la clé.
        const payload = await response.json().catch(() => null);
        const errors = Array.isArray(payload?.errors) ? payload.errors.slice(0, 3) : [];
        const detail = errors.map((e) => {
          const message = typeof e.message === 'string' ? e.message : '';
          return `${Number.isInteger(e.code) ? `code ${e.code} : ` : ''}${message}`;
        }).join(' ; ').split(key).join('[clé masquée]').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 350);
        throw new Error(`HenrikDev : réponse ${response.status}${detail ? ` — ${detail}` : '.'}`);
      }
      const payload = await response.json();
      if (payload.status && payload.status !== 200) throw new Error(`HenrikDev : données indisponibles (${payload.status}).`);
      if (payload.data === undefined) throw new Error('Format HenrikDev inattendu : données manquantes.');
      return payload.data;
    });
    queue = work.catch(() => {}); return work;
  }
  return {
    async account(name, tag) {
      const account = await request(`/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
      if (!account || typeof account.puuid !== 'string' || !account.puuid.trim()
        || typeof account.name !== 'string' || typeof account.tag !== 'string') {
        throw new Error('Format HenrikDev inattendu : identifiant du compte Valorant manquant.');
      }
      if (typeof account.region !== 'string' || account.region.toLowerCase() !== 'eu') {
        throw new Error('Ce suivi est configuré pour les comptes Valorant Europe (eu).');
      }
      return account;
    },
    async matches(puuid, count = 10) {
      const limit = Math.min(50, Math.max(1, Number(count) || 10));
      const found = [];
      for (let start = 0; start < limit; start += 10) {
        const batch = await request(`/valorant/v4/by-puuid/matches/eu/pc/${encodeURIComponent(puuid)}?size=${Math.min(10, limit - start)}&start=${start}`, true);
        if (batch === null) break;
        if (!Array.isArray(batch)) throw new Error('Format HenrikDev inattendu : historique invalide.');
        found.push(...batch);
        if (batch.length < Math.min(10, limit - start)) break;
      }
      const seen = new Set();
      return found.filter((m) => {
        const id = m.metadata?.match_id ?? m.metadata?.matchid;
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      }).slice(0, limit);
    },
    rank: (puuid) => request(`/valorant/v3/by-puuid/mmr/eu/pc/${encodeURIComponent(puuid)}`, true),
  };
}

const label = (v, fallback = 'Inconnu') => typeof v === 'string' ? v : v?.name || v?.id || fallback;
const numeric = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
export function valorantRows(matches, puuid) {
  return matches.flatMap((m) => {
    const metadata = m.metadata || {};
    const players = Array.isArray(m.players) ? m.players : m.players?.all_players;
    if (!players) throw new Error('Format HenrikDev inattendu : joueurs absents.');
    const p = players.find((p) => p.puuid === puuid);
    if (!p) return [];
    if (!p.stats || p.stats.kills === undefined || p.stats.deaths === undefined) {
      throw new Error('Format HenrikDev inattendu : K/D/A manquant.');
    }
    const teamId = p.team_id ?? p.team;
    const team = Array.isArray(m.teams) ? m.teams.find((t) => t.team_id === teamId)
      : m.teams?.[String(teamId).toLowerCase()];
    const won = team?.won ?? team?.has_won;
    const teams = Array.isArray(m.teams) ? m.teams : Object.values(m.teams || {});
    const hasWinner = teams.some((t) => t.won === true || t.has_won === true);
    const start = metadata.started_at ? Date.parse(metadata.started_at) : Number(metadata.game_start) * 1000;
    return [{ id: metadata.match_id ?? metadata.matchid, start: Number.isFinite(start) && start > 0 ? start : null,
      agent: label(p.agent ?? p.character), map: label(metadata.map),
      mode: label(metadata.queue ?? metadata.mode ?? metadata.game_mode),
      result: won === true ? 'Victoire' : won === false && hasWinner ? 'Défaite' : 'Nul / résultat non disponible',
      win: won === true, decided: typeof won === 'boolean' && hasWinner,
      kills: numeric(p.stats.kills), deaths: numeric(p.stats.deaths), assists: numeric(p.stats.assists),
      headshots: numeric(p.stats.headshots), bodyshots: numeric(p.stats.bodyshots), legshots: numeric(p.stats.legshots),
      score: p.stats.score === undefined ? null : numeric(p.stats.score),
      headshotAvailable: p.stats.headshots !== undefined && p.stats.bodyshots !== undefined && p.stats.legshots !== undefined,
      roundsWon: team?.rounds?.won ?? team?.rounds_won,
      roundsLost: team?.rounds?.lost ?? team?.rounds_lost,
    }];
  });
}

const fmt = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const ratio = (a, b) => b ? fmt(a / b) : a ? '∞ (aucune mort)' : '0';
export function valorantMatchEmbed(row, riotId) {
  return { title: `Valorant — ${riotId} : ${row.result}`, color: row.win ? 0x2ecc71 : row.decided ? 0xe74c3c : 0x95a5a6,
    fields: [
      { name: 'Agent', value: row.agent, inline: true }, { name: 'Carte', value: row.map, inline: true },
      { name: 'Kills / Morts / Assists', value: `${row.kills} / ${row.deaths} / ${row.assists}`, inline: true },
      { name: 'Mode', value: row.mode, inline: true },
      ...(row.roundsWon !== undefined && row.roundsLost !== undefined ? [{ name: 'Manches', value: `${row.roundsWon} – ${row.roundsLost}`, inline: true }] : []),
      ...(row.score !== null ? [{ name: 'Score de combat total', value: String(row.score), inline: true }] : []),
      ...(row.start ? [{ name: 'Début du match', value: `<t:${Math.floor(row.start / 1000)}:f>` }] : []),
    ], footer: { text: `Match ${row.id} • HenrikDev • Europe / PC` } };
}

export function valorantStatsEmbed(rows, rank, riotId, requested) {
  const totals = { kills: 0, deaths: 0, assists: 0, headshots: 0, shots: 0, wins: 0, decided: 0 };
  const agents = new Map();
  for (const r of rows) {
    totals.kills += r.kills; totals.deaths += r.deaths; totals.assists += r.assists;
    if (r.decided) { totals.decided++; if (r.win) totals.wins++; }
    if (r.headshotAvailable) { totals.headshots += r.headshots; totals.shots += r.headshots + r.bodyshots + r.legshots; }
    agents.set(r.agent, (agents.get(r.agent) || 0) + 1);
  }
  const current = rank?.current;
  const rankText = current?.tier?.name ? `${current.tier.name}${Number.isFinite(current.rr) ? ` — ${current.rr} RR` : ''}` : 'Non disponible / non classé';
  return { title: `Valorant — statistiques de ${riotId}`, color: 0xff4655,
    description: `**${rows.length} parties récentes disponibles**, tous modes confondus. Cet échantillon ne couvre pas toute la carrière.`,
    fields: [
      { name: 'Rang actuel', value: rankText, inline: true },
      { name: 'Meilleur rang disponible', value: rank?.peak?.tier?.name || 'Non disponible', inline: true },
      { name: 'Dernière variation de RR', value: Number.isFinite(current?.last_change) ? `${current.last_change >= 0 ? '+' : ''}${current.last_change} RR (dernier changement du compte)` : 'Non disponible', inline: true },
      { name: 'K/D', value: ratio(totals.kills, totals.deaths), inline: true },
      { name: 'KDA', value: ratio(totals.kills + totals.assists, totals.deaths), inline: true },
      { name: 'Victoires / Défaites', value: `${totals.wins} / ${totals.decided - totals.wins} (${rows.length - totals.decided} résultat(s) nul(s) ou inconnu(s))` },
      { name: 'Taux de victoire', value: totals.decided ? `${fmt(100 * totals.wins / totals.decided)} % des résultats décidés` : '—', inline: true },
      { name: 'K / D / A moyens', value: rows.length ? `${fmt(totals.kills / rows.length)} / ${fmt(totals.deaths / rows.length)} / ${fmt(totals.assists / rows.length)}` : '—', inline: true },
      { name: 'Tirs touchés à la tête', value: totals.shots ? `${fmt(100 * totals.headshots / totals.shots)} % des impacts documentés` : 'Non disponible', inline: true },
      { name: 'Agents les plus joués dans cet échantillon', value: [...agents].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([agent, n]) => `**${agent}** : ${n} partie(s)`).join('\n') || 'Aucune partie disponible' },
    ], footer: { text: `${requested} dernières parties demandées • HenrikDev • Europe / PC` } };
}

export function valorantHistoryEmbed(rows, riotId) {
  return { title: `Valorant — historique de ${riotId}`, color: 0xff4655,
    description: 'Dernières parties disponibles, les plus récentes en premier.',
    fields: rows.slice(0, 10).map((r) => ({ name: `${r.result} — ${r.agent} sur ${r.map}`,
      value: `**${r.kills} / ${r.deaths} / ${r.assists}** K/D/A • ${r.mode}${r.start ? ` • <t:${Math.floor(r.start / 1000)}:R>` : ''}\nMatch ${r.id}` })),
    footer: { text: 'HenrikDev • Europe / PC' } };
}

export async function pollValorantPlayer({ api, player, send, persist, isCurrent = () => true }) {
  const rows = valorantRows(await api.matches(player.puuid, 10), player.puuid);
  for (const row of [...rows].reverse()) {
    if (!isCurrent()) return;
    if (player.seen.includes(row.id)) continue;
    // Sans date vérifiable, ne pas présenter un vieux match comme une nouvelle partie.
    if (!row.start) continue;
    if (row.start >= player.linkedAt) {
      await send({ content: `Partie Valorant terminée pour <@${player.discordId}>`, embeds: [valorantMatchEmbed(row, player.riotId)] });
      if (!isCurrent()) return;
    }
    player.seen.push(row.id); player.seen = player.seen.slice(-100); persist();
  }
}
