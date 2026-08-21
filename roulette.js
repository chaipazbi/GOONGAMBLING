// Roulette européenne : 37 cases (0 à 36), 0 vert (avantage maison 2,7 %).
// Cotes réelles. payout = mise × (cote + 1) au total rendu (profit = mise × cote).

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function colorOf(n) {
  if (n === 0) return 'vert';
  return RED.has(n) ? 'rouge' : 'noir';
}

export function spin() {
  return Math.floor(Math.random() * 37); // 0..36
}

// Types de paris et cotes (profit pour 1 misé). "plein" nécessite un numéro.
export const BET_TYPES = {
  rouge:   { label: 'Rouge',        cote: 1,  test: (n) => colorOf(n) === 'rouge' },
  noir:    { label: 'Noir',         cote: 1,  test: (n) => colorOf(n) === 'noir' },
  pair:    { label: 'Pair',         cote: 1,  test: (n) => n !== 0 && n % 2 === 0 },
  impair:  { label: 'Impair',       cote: 1,  test: (n) => n % 2 === 1 },
  manque:  { label: 'Manque (1-18)', cote: 1, test: (n) => n >= 1 && n <= 18 },
  passe:   { label: 'Passe (19-36)', cote: 1, test: (n) => n >= 19 && n <= 36 },
  douzaine1: { label: '1re douzaine (1-12)',  cote: 2, test: (n) => n >= 1 && n <= 12 },
  douzaine2: { label: '2e douzaine (13-24)',  cote: 2, test: (n) => n >= 13 && n <= 24 },
  douzaine3: { label: '3e douzaine (25-36)',  cote: 2, test: (n) => n >= 25 && n <= 36 },
  colonne1:  { label: 'Colonne 1', cote: 2, test: (n) => n % 3 === 1 },
  colonne2:  { label: 'Colonne 2', cote: 2, test: (n) => n !== 0 && n % 3 === 2 },
  colonne3:  { label: 'Colonne 3', cote: 2, test: (n) => n !== 0 && n % 3 === 0 },
  plein:     { label: 'Numéro plein', cote: 35, needsNumber: true, test: (n, num) => n === num },
};

// Résout un pari sur un numéro sorti. Renvoie le total rendu (0 si perdu).
export function resolveBet(bet, result) {
  const def = BET_TYPES[bet.type];
  if (!def) return 0;
  const gagne = def.needsNumber ? def.test(result, bet.number) : def.test(result);
  return gagne ? bet.amount * (def.cote + 1) : 0;
}

export const ROULETTE_INFO = {
  cases: 37,
  edge: 2.7,
  cotes: [
    ['Rouge / Noir / Pair / Impair / Manque / Passe', '1:1 (≈48,6 %)'],
    ['Douzaine / Colonne', '2:1 (≈32,4 %)'],
    ['Numéro plein', '35:1 (≈2,7 %)'],
  ],
};
