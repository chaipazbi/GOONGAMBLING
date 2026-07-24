// Monnaie : soldes, transferts, récompense quotidienne — par serveur.
import { config } from './config.js';
import { ensureUser, save } from './store.js';
import { addXp } from './levels.js';

export function getBalance(guildId, userId) {
  return ensureUser(guildId, userId).balance;
}

export function addBalance(guildId, userId, amount) {
  const u = ensureUser(guildId, userId);
  u.balance += amount;
  save();
  return u.balance;
}

export function setBalance(guildId, userId, amount) {
  const u = ensureUser(guildId, userId);
  u.balance = amount;
  save();
  return u.balance;
}

export function transfer(guildId, fromId, toId, amount) {
  const from = ensureUser(guildId, fromId);
  if (from.balance < amount) return { ok: false, reason: 'solde' };
  from.balance -= amount;
  ensureUser(guildId, toId).balance += amount;
  save();
  return { ok: true };
}

// xp : montant d'XP accordé (le daily manuel en donne plus que la collecte auto).
export function claimDaily(guildId, userId, { xp = config.xpDaily } = {}) {
  const u = ensureUser(guildId, userId);
  const now = Date.now();
  const elapsed = now - u.lastDaily;

  if (elapsed < config.dailyCooldownMs) {
    return { ok: false, remaining: config.dailyCooldownMs - elapsed };
  }

  u.lastDaily = now;
  u.balance += config.dailyAmount;
  save();

  const gain = xp > 0 ? addXp(guildId, userId, xp) : null;
  return { ok: true, amount: config.dailyAmount, balance: u.balance, xp: gain };
}

// Programme (ou annule) la collecte auto. heure = "HH:MM" ou null.
export function setAutoDaily(guildId, userId, heure) {
  const u = ensureUser(guildId, userId);
  u.autoDaily = heure;
  if (!heure) u.lastAutoDate = null;
  save();
  return u.autoDaily;
}

export function parseHeure(input) {
  const m = String(input).trim().match(/^([01]?\d|2[0-3])[h:]([0-5]\d)$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
