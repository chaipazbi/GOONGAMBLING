// Logique des paris : cotes, mises, clôture, correction du résultat.
import { config } from './config.js';
import { getData, save, ensureUser, nextBetId } from './store.js';
import { addBalance } from './economy.js';
import { addXp } from './levels.js';

export function getBet(id) {
  return getData().bets[id] || null;
}

export function listBets(guildId, status = null) {
  return Object.values(getData().bets)
    .filter((b) => b.guildId === guildId && (status ? b.status === status : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createBet({ title, options, creatorId, guildId }) {
  const id = nextBetId();
  const bet = {
    id,
    title,
    options,
    status: 'open',
    creatorId,
    guildId,
    seed: config.betSeed,     // mise de la maison sur chaque issue
    channelId: null,
    messageId: null,
    createdAt: Date.now(),
    wagers: [],
    settlement: null,
  };
  getData().bets[id] = bet;
  save();
  return bet;
}

export function setBetMessage(id, channelId, messageId) {
  const bet = getBet(id);
  if (!bet) return null;
  bet.channelId = channelId;
  bet.messageId = messageId;
  save();
  return bet;
}

export function setStatus(id, status) {
  const bet = getBet(id);
  if (!bet) return null;
  bet.status = status;
  save();
  return bet;
}

// ---------- Cotes ----------
// Cagnotte d'une issue = mise de la maison + mises des joueurs.
// Cote = cagnotte totale / cagnotte de l'issue.
// Au départ (2 issues, maison 100) : 200 / 100 = 2.00.

export function pools(bet) {
  const seed = bet.seed ?? 0;
  const p = {};
  for (const o of bet.options) p[o] = seed;
  for (const w of bet.wagers) p[w.option] = (p[w.option] || 0) + w.amount;
  return p;
}

export function totalPool(bet) {
  return Object.values(pools(bet)).reduce((a, b) => a + b, 0);
}

export function playerPool(bet) {
  return bet.wagers.reduce((s, w) => s + w.amount, 0);
}

export function odds(bet, option) {
  const p = pools(bet);
  const total = totalPool(bet);
  if (!total || !p[option]) return null;
  return total / p[option];
}

export function oddsLabel(bet, option) {
  const v = odds(bet, option);
  return v === null ? '—' : v.toFixed(2);
}

// ---------- Mises ----------

export function placeWager(bet, userId, option, amount) {
  if (bet.status !== 'open') return { ok: false, reason: 'ferme' };
  if (amount < config.minWager) return { ok: false, reason: 'min' };

  const other = bet.wagers.find((w) => w.userId === userId && w.option !== option);
  if (other) return { ok: false, reason: 'autre_option', option: other.option };

  const u = ensureUser(userId);
  if (u.balance < amount) return { ok: false, reason: 'solde' };

  const premiereFois = !bet.wagers.some((w) => w.userId === userId);
  bet.wagers.push({ userId, option, amount });
  u.balance -= amount;
  u.stats.totalStaked += amount;
  if (premiereFois) u.stats.betsPlayed += 1;
  save();
  return { ok: true };
}

export function userStake(bet, userId, option = null) {
  return bet.wagers
    .filter((w) => w.userId === userId && (option === null || w.option === option))
    .reduce((s, w) => s + w.amount, 0);
}

// ---------- Clôture ----------
// Chaque gagnant reçoit : mise x (cagnotte totale / cagnotte gagnante).
// Tout ce qui est versé est enregistré dans bet.settlement pour pouvoir
// annuler proprement en cas de correction du résultat.

export function settle(bet, winningOption) {
  const p = pools(bet);
  const total = totalPool(bet);
  const winPool = p[winningOption];
  const entries = [];

  const gagnants = bet.wagers.filter((w) => w.option === winningOption);
  const ratio = winPool > 0 ? total / winPool : 0;

  if (bet.wagers.length === 0) {
    // Personne n'a misé : rien à distribuer.
  } else if (gagnants.length === 0) {
    // Personne sur la bonne issue : on rembourse tout le monde.
    const parJoueur = groupStakes(bet.wagers);
    for (const [userId, stake] of Object.entries(parJoueur)) {
      addBalance(userId, stake);
      entries.push({ userId, coins: stake, xp: 0, kind: 'refund', stake, net: 0 });
    }
  } else {
    const misesGagnantes = groupStakes(gagnants);
    const misesPerdantes = groupStakes(bet.wagers.filter((w) => w.option !== winningOption));

    for (const [userId, stake] of Object.entries(misesGagnantes)) {
      const payout = Math.floor(stake * ratio);
      const net = payout - stake;
      const xp = config.xpBetWin + Math.floor(Math.max(0, net) / config.xpPerCoins);

      addBalance(userId, payout);
      addXp(userId, xp);
      const u = ensureUser(userId);
      u.stats.betsWon += 1;
      u.stats.totalWon += net;

      entries.push({ userId, coins: payout, xp, kind: 'win', stake, net });
    }

    for (const [userId, stake] of Object.entries(misesPerdantes)) {
      const u = ensureUser(userId);
      u.stats.betsLost += 1;
      u.stats.totalLost += stake;
      entries.push({ userId, coins: 0, xp: 0, kind: 'lose', stake, net: -stake });
    }
  }

  bet.settlement = {
    winningOption,
    settledAt: Date.now(),
    ratio: gagnants.length ? ratio : null,
    total,
    entries,
  };
  bet.status = 'resolved';
  save();
  return bet.settlement;
}

// Annule intégralement une clôture : reprend les pièces et l'XP versées,
// et remet les compteurs de stats comme avant.
export function unsettle(bet) {
  if (!bet.settlement) return null;

  for (const e of bet.settlement.entries) {
    const u = ensureUser(e.userId);
    u.balance -= e.coins;
    if (e.xp) u.xp = Math.max(0, u.xp - e.xp);

    if (e.kind === 'win') {
      u.stats.betsWon = Math.max(0, u.stats.betsWon - 1);
      u.stats.totalWon -= e.net;
    } else if (e.kind === 'lose') {
      u.stats.betsLost = Math.max(0, u.stats.betsLost - 1);
      u.stats.totalLost = Math.max(0, u.stats.totalLost - e.stake);
    }
  }

  const ancien = bet.settlement;
  bet.settlement = null;
  bet.status = 'closed';
  save();
  return ancien;
}

// Corrige le résultat : annule l'ancienne clôture puis reclôture sur la bonne issue.
export function resettle(bet, nouvelleOption) {
  unsettle(bet);
  return settle(bet, nouvelleOption);
}

// Rembourse toutes les mises et annule le pari (y compris après clôture).
export function refundAll(bet) {
  if (bet.settlement) unsettle(bet);

  const parJoueur = groupStakes(bet.wagers);
  for (const [userId, stake] of Object.entries(parJoueur)) {
    addBalance(userId, stake);
    const u = ensureUser(userId);
    u.stats.betsPlayed = Math.max(0, u.stats.betsPlayed - 1);
    u.stats.totalStaked = Math.max(0, u.stats.totalStaked - stake);
  }

  bet.status = 'cancelled';
  save();
  return Object.keys(parJoueur).length;
}

function groupStakes(wagers) {
  const out = {};
  for (const w of wagers) out[w.userId] = (out[w.userId] || 0) + w.amount;
  return out;
}
