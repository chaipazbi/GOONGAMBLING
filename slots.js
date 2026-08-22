// Machine à sous : 3 rouleaux. Réglée à l'avantage des joueurs (RTP > 100 %).
// Chaque symbole a un poids (fréquence) et un gain si on en aligne 3.
export const SYMBOLS = [
  { e: '🍒', w: 30, x3: 3,   x2: 1.5 },
  { e: '🍋', w: 26, x3: 4,   x2: 1.5 },
  { e: '🔔', w: 20, x3: 6,   x2: 2 },
  { e: '⭐', w: 14, x3: 10,  x2: 2 },
  { e: '💎', w: 8,  x3: 20,  x2: 3 },
  { e: '🎰', w: 4,  x3: 60,  x2: 5 },
];

function pick() {
  const total = SYMBOLS.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) {
    r -= s.w;
    if (r < 0) return s;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

// Renvoie { reels:[s,s,s], mult, gain } — gain = mise * mult (0 si perdu).
export function spin(bet) {
  const reels = [pick(), pick(), pick()];
  let mult = 0;
  if (reels[0].e === reels[1].e && reels[1].e === reels[2].e) {
    mult = reels[0].x3; // trois identiques
  } else if (reels[0].e === reels[1].e || reels[1].e === reels[2].e || reels[0].e === reels[2].e) {
    // deux identiques : on prend le symbole en double
    const pair = reels[0].e === reels[1].e ? reels[0] : reels[1].e === reels[2].e ? reels[1] : reels[0];
    mult = pair.x2;
  }
  return { reels: reels.map((s) => s.e), mult, gain: Math.floor(bet * mult) };
}
