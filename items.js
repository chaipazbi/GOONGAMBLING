// Objets : potions (buffs) et retour arrière. Achetables en boutique + drop.
import { ensureUser, save } from './store.js';
import { addBalance } from './economy.js';
import { addXp } from './levels.js';

export const ITEMS = {
  potion_coins: { nom: 'Potion ×2 pièces', emoji: '🧪', prix: 2000, desc: 'Double le bénéfice de ton prochain gain (jeu ou pari).' },
  potion_xp:    { nom: 'Potion ×2 XP',     emoji: '📗', prix: 1000, desc: "Double l'XP de ton prochain pari gagné." },
  rewind:       { nom: 'Retour arrière',    emoji: '⏪', prix: 5000, desc: 'Récupère la mise de ta dernière perte.' },
};

// Taux de drop lors d'une victoire (jeu ou pari gagné).
export const DROP_RATES = { potion_coins: 0.01, potion_xp: 0.02, rewind: 0.005 };

export function itemCount(user, id) {
  return (user.items || {})[id] || 0;
}

export function itemList(user) {
  return Object.keys(ITEMS).filter((id) => itemCount(user, id) > 0).map((id) => ({ id, count: user.items[id] }));
}

export function giveItem(guildId, userId, id, n = 1) {
  const u = ensureUser(guildId, userId);
  u.items ??= {};
  u.items[id] = (u.items[id] || 0) + n;
  save();
  return u.items[id];
}

export function takeItem(guildId, userId, id, n = 1) {
  const u = ensureUser(guildId, userId);
  u.items ??= {};
  const dispo = u.items[id] || 0;
  const retire = Math.min(dispo, n);
  u.items[id] = dispo - retire;
  if (u.items[id] <= 0) delete u.items[id];
  save();
  return retire;
}

// ---- Buffs : armer une potion (consomme l'objet) ----
export function arm(guildId, userId, id) {
  const u = ensureUser(guildId, userId);
  if (itemCount(u, id) < 1) return { ok: false, reason: 'none' };
  u.buffs ??= {};
  const key = id === 'potion_coins' ? 'coins2x' : id === 'potion_xp' ? 'xp2x' : null;
  if (!key) return { ok: false, reason: 'type' };
  if (u.buffs[key]) return { ok: false, reason: 'already' };
  takeItem(guildId, userId, id, 1);
  u.buffs[key] = true;
  save();
  return { ok: true };
}

export function hasBuff(user, key) {
  return !!(user.buffs && user.buffs[key]);
}

// ---- Application aux gains ----
// Victoire : crédite le bonus ×2 pièces si armé, tire les drops. Renvoie {bonus, drops}.
export function applyWin(guildId, userId, profit) {
  const u = ensureUser(guildId, userId);
  let bonus = 0;
  if (profit > 0 && hasBuff(u, 'coins2x')) {
    bonus = profit;
    addBalance(guildId, userId, bonus);
    u.buffs.coins2x = false;
  }
  const drops = rollDrops(guildId, userId);
  save();
  return { bonus, drops };
}

// XP d'un pari gagné : double si armé. Renvoie le bonus d'XP.
export function applyXp(guildId, userId, xpGained) {
  const u = ensureUser(guildId, userId);
  if (xpGained > 0 && hasBuff(u, 'xp2x')) {
    u.buffs.xp2x = false;
    save();
    addXp(guildId, userId, xpGained);
    return xpGained;
  }
  return 0;
}

function rollDrops(guildId, userId) {
  const drops = [];
  for (const [id, rate] of Object.entries(DROP_RATES)) {
    if (Math.random() < rate) {
      giveItem(guildId, userId, id, 1);
      drops.push(id);
    }
  }
  return drops;
}

// ---- Retour arrière ----
export function recordLoss(guildId, userId, amount, label = '') {
  if (amount <= 0) return;
  const u = ensureUser(guildId, userId);
  u.lastLoss = { amount, label, ts: Date.now() };
  save();
}

export function useRewind(guildId, userId) {
  const u = ensureUser(guildId, userId);
  if (itemCount(u, 'rewind') < 1) return { ok: false, reason: 'none' };
  if (!u.lastLoss || u.lastLoss.amount <= 0) return { ok: false, reason: 'noloss' };
  takeItem(guildId, userId, 'rewind', 1);
  const montant = u.lastLoss.amount;
  const label = u.lastLoss.label;
  addBalance(guildId, userId, montant);
  u.lastLoss = null;
  save();
  return { ok: true, montant, label };
}
