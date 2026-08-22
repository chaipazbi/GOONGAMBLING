// Missions quotidiennes : 3 par jour, objectif tiré dans une fourchette,
// récompense proportionnelle à l'objectif. Reset à minuit.
import { ensureUser, save } from './store.js';
import { addBalance } from './economy.js';
import { addXp } from './levels.js';
import { today } from './time.js';

// Catalogue. Pour chaque type : fourchette d'objectif [min, max] et récompense
// PAR UNITÉ d'objectif (coinsPer/xpPer). Récompense finale = objectif × par-unité.
// step = pas d'arrondi de l'objectif (ex. miser : multiples de 500).
export const CATALOG = [
  { type: 'bet_win',     nom: 'Gagner des paris',            min: 1,    max: 4,    step: 1,   coinsPer: 150,  xpPer: 15,    texte: (c) => `Gagner ${c} pari${c > 1 ? 's' : ''}` },
  { type: 'crate_open',  nom: 'Ouvrir des caisses',          min: 1,    max: 4,    step: 1,   coinsPer: 120,  xpPer: 12,    texte: (c) => `Ouvrir ${c} caisse${c > 1 ? 's' : ''}` },
  { type: 'casino_play', nom: 'Jouer au casino',             min: 3,    max: 10,   step: 1,   coinsPer: 60,   xpPer: 6,     texte: (c) => `Jouer ${c} parties au casino` },
  { type: 'race_win',    nom: 'Gagner des courses',          min: 1,    max: 3,    step: 1,   coinsPer: 300,  xpPer: 30,    texte: (c) => `Gagner ${c} course${c > 1 ? 's' : ''} de chevaux` },
  { type: 'wager_total', nom: 'Miser des pièces',            min: 1000, max: 5000, step: 500, coinsPer: 0.12, xpPer: 0.012, texte: (c) => `Miser ${c.toLocaleString('fr-FR')} pièces au total` },
  { type: 'slots_play',  nom: 'Jouer à la machine à sous',   min: 2,    max: 8,    step: 1,   coinsPer: 70,   xpPer: 7,     texte: (c) => `Faire ${c} parties de machine à sous` },
  { type: 'daily_done',  nom: 'Récupérer ton daily',         min: 1,    max: 1,    step: 1,   coinsPer: 150,  xpPer: 15,    texte: () => `Récupérer ton daily` },
];

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// Tire un objectif dans la fourchette (aligné sur step).
function tirerCible(m) {
  const pas = m.step || 1;
  const nbPas = Math.floor((m.max - m.min) / pas) + 1;
  return m.min + Math.floor(Math.random() * nbPas) * pas;
}

function rollMissions() {
  return shuffle(CATALOG).slice(0, 3).map((m) => {
    const cible = tirerCible(m);
    return {
      type: m.type,
      cible,
      texte: m.texte(cible),
      coins: Math.round(cible * m.coinsPer),
      xp: Math.round(cible * m.xpPer),
      progress: 0,
      claimed: false,
    };
  });
}

export function getMissions(guildId, userId) {
  const u = ensureUser(guildId, userId);
  const t = today();
  if (!u.missions || u.missions.date !== t) {
    u.missions = { date: t, list: rollMissions() };
    save();
  }
  return u.missions;
}

// Fait progresser toutes les missions du bon type. amount = incrément.
export function track(guildId, userId, type, amount = 1) {
  const m = getMissions(guildId, userId);
  let changed = false;
  for (const mi of m.list) {
    if (mi.type === type && !mi.claimed && mi.progress < mi.cible) {
      mi.progress = Math.min(mi.cible, mi.progress + amount);
      changed = true;
    }
  }
  if (changed) save();
}

// Réclame une mission terminée (par index).
export function claim(guildId, userId, index) {
  const m = getMissions(guildId, userId);
  const mi = m.list[index];
  if (!mi) return { ok: false, reason: 'introuvable' };
  if (mi.claimed) return { ok: false, reason: 'deja' };
  if (mi.progress < mi.cible) return { ok: false, reason: 'incomplet' };
  mi.claimed = true;
  addBalance(guildId, userId, mi.coins);
  const gain = addXp(guildId, userId, mi.xp);
  save();
  return { ok: true, coins: mi.coins, xp: mi.xp, levelUp: gain.levelUp, level: gain.level };
}

// Décrit le catalogue complet (pour le bouton "quêtes possibles").
export function catalogInfo() {
  return CATALOG.map((m) => {
    const objectif = m.min === m.max ? `${m.min.toLocaleString('fr-FR')}` : `${m.min.toLocaleString('fr-FR')} à ${m.max.toLocaleString('fr-FR')}`;
    const recompense = m.min === m.max
      ? `${Math.round(m.min * m.coinsPer)} 🪙 + ${Math.round(m.min * m.xpPer)} XP`
      : `${Math.round(m.min * m.coinsPer)}–${Math.round(m.max * m.coinsPer)} 🪙 + ${Math.round(m.min * m.xpPer)}–${Math.round(m.max * m.xpPer)} XP`;
    return { nom: m.nom, objectif, recompense };
  });
}
