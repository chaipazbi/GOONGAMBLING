// Système de niveaux / XP et statistiques joueur.
import { ensureUser, save, allUsers } from './store.js';

// XP cumulée nécessaire pour ATTEINDRE un niveau.
// Niveau 1 = 0, 2 = 100, 3 = 300, 4 = 600, 5 = 1000 ... (+100 par palier)
export function xpToReach(level) {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  return level;
}

export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const floorXp = xpToReach(level);
  const nextXp = xpToReach(level + 1);
  return {
    level,
    into: xp - floorXp,          // XP acquise dans le niveau courant
    span: nextXp - floorXp,      // XP totale du niveau courant
    remaining: nextXp - xp,
  };
}

export function addXp(userId, amount) {
  const u = ensureUser(userId);
  const before = levelFromXp(u.xp);
  u.xp = Math.max(0, u.xp + amount);
  const after = levelFromXp(u.xp);
  save();
  return { gained: amount, xp: u.xp, level: after, levelUp: after > before };
}

export function setXp(userId, total) {
  const u = ensureUser(userId);
  u.xp = Math.max(0, total);
  save();
  return u.xp;
}

export function progressBar(into, span, size = 12) {
  const ratio = span > 0 ? Math.min(1, into / span) : 0;
  const filled = Math.round(ratio * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

// Ratio de victoire, façon "KDA" : % de paris gagnés sur les paris tranchés.
export function winRate(stats) {
  const decided = stats.betsWon + stats.betsLost;
  return decided > 0 ? (stats.betsWon / decided) * 100 : 0;
}

export function ratioWL(stats) {
  if (stats.betsLost === 0) return stats.betsWon > 0 ? '∞' : '0.00';
  return (stats.betsWon / stats.betsLost).toFixed(2);
}

export function leaderboard(kind = 'coins', limit = 10) {
  const users = allUsers();
  const sorted =
    kind === 'xp'
      ? users.sort((a, b) => b.xp - a.xp)
      : users.sort((a, b) => b.balance - a.balance);
  return sorted.slice(0, limit);
}
