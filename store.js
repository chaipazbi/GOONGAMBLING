// Couche de stockage : lecture/écriture de data.json + migration automatique
// des anciennes données (les fichiers de la v2 restent compatibles).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data.json');

let data;

function migrateUser(u) {
  u.balance ??= config.startingBalance;
  u.lastDaily ??= 0;
  u.xp ??= 0;
  u.autoDaily ??= null;      // "09:00" ou null
  u.lastAutoDate ??= null;   // "2026-07-23" : dernier jour où l'auto a tourné
  u.stats ??= {};
  u.stats.betsPlayed ??= 0;
  u.stats.betsWon ??= 0;
  u.stats.betsLost ??= 0;
  u.stats.totalStaked ??= 0;
  u.stats.totalWon ??= 0;    // gains NETS cumulés
  u.stats.totalLost ??= 0;   // mises perdues cumulées
  return u;
}

function migrateBet(b) {
  // Les paris créés AVANT la v3 gardent une mise maison à 0 : leurs cotes
  // ne bougent pas en cours de route. Seuls les nouveaux paris sont amorcés.
  b.seed ??= 0;
  b.wagers ??= [];
  b.settlement ??= null;
  b.channelId ??= null;
  b.messageId ??= null;
  return b;
}

function load() {
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    data = {};
  }
  data.users ??= {};
  data.bets ??= {};
  data.config ??= { nextBetId: 1 };
  for (const u of Object.values(data.users)) migrateUser(u);
  for (const b of Object.values(data.bets)) migrateBet(b);
  save();
}

export function save() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

export function getData() {
  return data;
}

export function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = migrateUser({});
    save();
  }
  return data.users[userId];
}

export function allUsers() {
  return Object.entries(data.users).map(([id, u]) => ({ id, ...u }));
}

export function nextBetId() {
  const id = data.config.nextBetId++;
  save();
  return id;
}

load();
