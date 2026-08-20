// Monnaie : soldes, transferts, récompense quotidienne — par serveur.
import { config } from './config.js';
import { ensureUser, save } from './store.js';
import { addXp } from './levels.js';
import { today } from './time.js';

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

// Un daily par jour de calendrier (fuseau configuré), partagé par le manuel et
// la collecte auto. xp : montant d'XP accordé (le manuel en donne plus).
// date : jour de référence (par défaut aujourd'hui) — permet à l'auto de passer
// le jour exact du tick.
export function claimDaily(guildId, userId, { xp = config.xpDaily, amount = config.dailyAmount, date = today() } = {}) {
  const u = ensureUser(guildId, userId);

  if (u.lastDailyDate === date) {
    return { ok: false, already: true };
  }

  u.lastDailyDate = date;
  u.lastDaily = Date.now();
  u.balance += amount;
  save();

  const gain = xp > 0 ? addXp(guildId, userId, xp) : null;
  return { ok: true, amount, balance: u.balance, xp: gain };
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
