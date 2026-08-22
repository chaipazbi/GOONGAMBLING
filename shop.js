// Boutique quotidienne, inventaire de caisses et ouverture.
import { CRATES, CRATE_REWARDS, CRATE_RIEN, MYTHIC_TOP, SHOP_SLOTS } from './config.js';
import { ensureUser, save } from './store.js';
import { addBalance } from './economy.js';
import { addXp } from './levels.js';

export function crateById(id) {
  return CRATES.find((c) => c.id === id) || null;
}
function crateIndex(id) {
  return CRATES.findIndex((c) => c.id === id);
}
export function nextCrate(id) {
  return CRATES[crateIndex(id) + 1] || null;
}

function weightedPick(items, weightFn) {
  const total = items.reduce((s, i) => s + weightFn(i), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function rollShop(n = SHOP_SLOTS) {
  return Array.from({ length: n }, () => weightedPick(CRATES, (c) => c.spawn).id);
}

// --------- Ouverture (RNG pur) ---------

function drawReward(crateId) {
  const isMythic = crateId === 'mythique';

  // 1) "rien" d'abord, avec une probabilité propre à la rareté.
  const rien = CRATE_RIEN[crateId] ?? 0;
  if (Math.random() < rien) return { kind: 'nothing' };

  // 2) sinon, tirage pondéré parmi les récompenses.
  const total = CRATE_REWARDS.reduce((s, o) => s + o.w, 0);
  let r = Math.random() * total;
  for (const o of CRATE_REWARDS) {
    r -= o.w;
    if (r < 0) {
      if (o.kind === 'upgrade' && isMythic) return { ...MYTHIC_TOP };
      return o;
    }
  }
  return { kind: 'nothing' };
}

// Ouvre une caisse. Gère la chaîne si on gagne une caisse supérieure.
// Renvoie { chain, totalCoins, totalXp }.
export function openCrate(crateId) {
  const chain = [];
  const seen = new Set();
  let currentId = crateId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const crate = crateById(currentId);
    const reward = drawReward(currentId);

    if (reward.kind === 'coins') {
      chain.push({ crateId: currentId, kind: 'coins', mult: reward.mult, coins: Math.floor(crate.prix * reward.mult) });
      break;
    }
    if (reward.kind === 'xp') {
      chain.push({ crateId: currentId, kind: 'xp', xp: reward.xp });
      break;
    }
    if (reward.kind === 'upgrade') {
      const nxt = nextCrate(currentId);
      chain.push({ crateId: currentId, kind: 'upgrade', nextId: nxt?.id ?? null });
      currentId = nxt?.id ?? null;
      continue;
    }
    chain.push({ crateId: currentId, kind: 'nothing' });
    break;
  }

  return {
    chain,
    totalCoins: chain.reduce((s, c) => s + (c.coins || 0), 0),
    totalXp: chain.reduce((s, c) => s + (c.xp || 0), 0),
  };
}

// --------- Inventaire ---------

export function inventoryList(user) {
  const inv = user.crates || {};
  return CRATES.filter((c) => (inv[c.id] || 0) > 0).map((c) => ({ id: c.id, count: inv[c.id] }));
}

export function crateCount(user, id) {
  return (user.crates || {})[id] || 0;
}

// Ajoute des caisses à l'inventaire. spent = pièces dépensées pour les acquérir.
export function giveCrates(guildId, userId, id, n = 1, { spent = 0 } = {}) {
  const u = ensureUser(guildId, userId);
  u.crates ??= {};
  u.crates[id] = (u.crates[id] || 0) + n;
  if (spent) u.stats.crateSpent += spent;
  save();
  return u.crates[id];
}

// Retire des caisses. Renvoie le nombre réellement retiré.
export function takeCrates(guildId, userId, id, n = 1) {
  const u = ensureUser(guildId, userId);
  u.crates ??= {};
  const dispo = u.crates[id] || 0;
  const retire = Math.min(dispo, n);
  u.crates[id] = dispo - retire;
  if (u.crates[id] <= 0) delete u.crates[id];
  save();
  return retire;
}

// Ouvre une caisse DE L'INVENTAIRE : la retire, tire la récompense, crédite
// pièces + XP, met à jour les stats. Renvoie le résultat (ou null si absente).
export function openFromInventory(guildId, userId, id) {
  const u = ensureUser(guildId, userId);
  if ((u.crates?.[id] || 0) < 1) return null;

  takeCrates(guildId, userId, id, 1);
  const result = openCrate(id);

  if (result.totalCoins) addBalance(guildId, userId, result.totalCoins);
  const xpGain = result.totalXp ? addXp(guildId, userId, result.totalXp) : null;

  u.stats.cratesOpened += result.chain.length;
  u.stats.crateWon += result.totalCoins;
  u.stats.crateXp += result.totalXp;
  save();

  return { ...result, xpGain };
}
