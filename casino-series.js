export const MAX_DRAWS = 100;

export function parseOrder(rawBet, rawCount, balance, maxBet = 50000) {
  const countText = String(rawCount ?? '').trim() || '1';
  if (!/^\d+$/.test(countText)) return { err: 'Nombre de tirages invalide : indique un entier de 1 à 100.' };
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_DRAWS) return { err: 'Choisis de 1 à 100 tirages.' };
  const raw = String(rawBet).replace(/\s/g, '');
  const numeric = /^(\d+(?:[.,]\d+)?)(k)?$/i.exec(raw);
  let amount;
  if (/^(all|tout|max)$/i.test(raw)) amount = Math.min(Math.floor(balance / count), maxBet || Math.floor(balance / count));
  else if (numeric) amount = Number(numeric[1].replace(',', '.')) * (numeric[2] ? 1000 : 1);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { err: 'Montant invalide (ex. 5000, 5K ou all).' };
  if (maxBet && amount > maxBet) return { err: `Plafond : ${maxBet.toLocaleString('fr-FR')} pièces par tirage.` };
  const cost = amount * count;
  if (!Number.isSafeInteger(cost) || cost > balance) return { err: `Solde insuffisant : ${count} × ${amount.toLocaleString('fr-FR')} = ${cost.toLocaleString('fr-FR')} pièces nécessaires.` };
  return { amount, count, cost };
}

// Débit intégral avant le premier tirage ; aucun réinvestissement des gains.
export function runSeries(order, { debit, draw, settle }) {
  debit(order.cost);
  const rounds = [];
  for (let index = 0; index < order.count; index++) {
    const result = draw(order.amount, index);
    rounds.push({ result, effect: settle(order.amount, result, index) });
  }
  return rounds;
}

// Chaque entrée participe aux premiers N tours. Les joueurs présents partagent
// le même résultat du tour, quel que soit le nombre de tours qu'ils ont payé.
export function resolveLobbySeries(bets, { draw, payout, settleRound }) {
  const count = Math.max(...bets.map((b) => b.count || 1));
  const rounds = [];
  for (let index = 0; index < count; index++) {
    const result = draw(index);
    const payouts = bets.filter((b) => index < (b.count || 1)).map((b) => ({ ...b, total: payout(b, result) }));
    settleRound(payouts, index);
    rounds.push({ result, payouts });
  }
  return rounds;
}

export function seriesTotals(rounds) {
  const totals = new Map();
  for (const round of rounds) for (const p of round.payouts) {
    const total = totals.get(p.userId) || { userId: p.userId, amount: 0, total: 0 };
    total.amount += p.amount; total.total += p.total; totals.set(p.userId, total);
  }
  return [...totals.values()];
}
