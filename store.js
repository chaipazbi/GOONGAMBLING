// Stockage : data.json cloisonné PAR SERVEUR.
// Structure : { guilds: { "<guildId>": { users: {...}, bets: {...}, nextBetId: 1 } } }
// Les données de l'ancien format (tout à plat) sont migrées automatiquement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data.json');

let data;

function defaultUser() {
  return {
    balance: config.startingBalance,
    lastDaily: 0,
    xp: 0,
    autoDaily: null,
    lastAutoDate: null,
    stats: {
      betsPlayed: 0,
      betsWon: 0,
      betsLost: 0,
      totalStaked: 0,
      totalWon: 0,
      totalLost: 0,
    },
  };
}

function migrateUser(u) {
  const d = defaultUser();
  u.balance ??= d.balance;
  u.lastDaily ??= d.lastDaily;
  u.xp ??= d.xp;
  u.autoDaily ??= d.autoDaily;
  u.lastAutoDate ??= d.lastAutoDate;
  u.stats ??= {};
  for (const k of Object.keys(d.stats)) u.stats[k] ??= 0;
  return u;
}

function migrateBet(b) {
  b.seed ??= 0;
  b.wagers ??= [];
  b.settlement ??= null;
  b.channelId ??= null;
  b.messageId ??= null;
  return b;
}

// Ancien format (v3) : data.users et data.bets à plat, sans cloisonnement.
function migrerVersMultiServeur(d) {
  if (d.guilds) return d;

  const ancienUsers = d.users || {};
  const ancienBets = d.bets || {};
  const guilds = {};

  // Serveur d'origine des joueurs existants
  let principal = process.env.MAIN_GUILD_ID || config.guildId || null;
  if (!principal) {
    const compte = {};
    for (const b of Object.values(ancienBets)) {
      if (b.guildId) compte[b.guildId] = (compte[b.guildId] || 0) + 1;
    }
    principal = Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0] || 'legacy';
  }

  const bucket = (gid) => (guilds[gid] ??= { users: {}, bets: {}, nextBetId: 1 });

  // Les joueurs rejoignent le serveur principal
  for (const [userId, u] of Object.entries(ancienUsers)) {
    bucket(principal).users[userId] = migrateUser(u);
  }

  // Les paris rejoignent leur propre serveur (ils portent déjà guildId)
  for (const b of Object.values(ancienBets)) {
    const gid = b.guildId || principal;
    bucket(gid).bets[b.id] = migrateBet(b);
  }

  // Numérotation repartie par serveur
  for (const g of Object.values(guilds)) {
    const ids = Object.values(g.bets).map((b) => Number(b.id) || 0);
    g.nextBetId = ids.length ? Math.max(...ids) + 1 : 1;
  }

  const nb = Object.keys(ancienUsers).length;
  if (nb) console.log(`   Migration : ${nb} joueur(s) rattaché(s) au serveur ${principal}`);

  return { guilds };
}

function load() {
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    data = {};
  }

  data = migrerVersMultiServeur(data);
  data.guilds ??= {};

  for (const g of Object.values(data.guilds)) {
    g.users ??= {};
    g.bets ??= {};
    g.nextBetId ??= 1;
    for (const u of Object.values(g.users)) migrateUser(u);
    for (const b of Object.values(g.bets)) migrateBet(b);
  }
  save();
}

export function save() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

export function getData() {
  return data;
}

export function ensureGuild(guildId) {
  data.guilds[guildId] ??= { users: {}, bets: {}, nextBetId: 1 };
  return data.guilds[guildId];
}

export function ensureUser(guildId, userId) {
  const g = ensureGuild(guildId);
  if (!g.users[userId]) {
    g.users[userId] = defaultUser();
    save();
  }
  return g.users[userId];
}

export function allUsers(guildId) {
  return Object.entries(ensureGuild(guildId).users).map(([id, u]) => ({ id, ...u }));
}

export function allGuildIds() {
  return Object.keys(data.guilds);
}

export function guildBets(guildId) {
  return ensureGuild(guildId).bets;
}

export function nextBetId(guildId) {
  const g = ensureGuild(guildId);
  const id = g.nextBetId++;
  save();
  return id;
}

load();
