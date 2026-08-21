// Blackjack : chaque joueur affronte le croupier (le bot).
// Gain : mise perdue si défaite ; en cas de victoire, mise × multiplicateur
// tiré au hasard entre BJ_MIN_MULT et BJ_MAX_MULT. Égalité = mise rendue.
import { drawCard, handValue, isBlackjack, isBust } from './cards.js';

export const BJ_MIN_MULT = 2.00;
export const BJ_MAX_MULT = 2.80;

function randomMult() {
  const m = BJ_MIN_MULT + Math.random() * (BJ_MAX_MULT - BJ_MIN_MULT);
  return Math.round(m * 100) / 100;
}

// Crée une partie. La mise est déjà débitée par l'appelant.
export function newGame(userId, bet) {
  const player = [drawCard(), drawCard()];
  const dealer = [drawCard(), drawCard()];
  const game = {
    userId,
    bet,
    player,
    dealer,
    doubled: false,
    status: 'playing', // playing | done
    outcome: null, // win | lose | push | blackjack
    mult: null,
    payout: 0,
  };
  // Blackjack immédiat (naturel)
  if (isBlackjack(player) || isBlackjack(dealer)) finish(game);
  return game;
}

export function hit(game) {
  if (game.status !== 'playing') return game;
  game.player.push(drawCard());
  if (isBust(game.player)) finish(game);
  return game;
}

export function stand(game) {
  if (game.status !== 'playing') return game;
  finish(game);
  return game;
}

// Double : double la mise (débit du complément par l'appelant), une carte, puis stand.
export function double(game) {
  if (game.status !== 'playing' || game.player.length !== 2) return { ok: false };
  game.doubled = true;
  game.bet *= 2;
  game.player.push(drawCard());
  finish(game);
  return { ok: true };
}

function dealerPlay(game) {
  while (handValue(game.dealer) < 17) game.dealer.push(drawCard());
}

// Termine la partie : joue le croupier si besoin, détermine l'issue et le gain.
function finish(game) {
  const pv = handValue(game.player);
  const pBJ = isBlackjack(game.player);
  const dBJ = isBlackjack(game.dealer);

  // Blackjacks naturels (avant que le joueur tire)
  if (pBJ || dBJ) {
    game.status = 'done';
    if (pBJ && dBJ) return settle(game, 'push');
    if (pBJ) return settle(game, 'blackjack');
    return settle(game, 'lose');
  }

  if (isBust(game.player)) {
    game.status = 'done';
    return settle(game, 'lose');
  }

  dealerPlay(game);
  const dv = handValue(game.dealer);
  game.status = 'done';

  if (dv > 21) return settle(game, 'win');
  if (pv > dv) return settle(game, 'win');
  if (pv < dv) return settle(game, 'lose');
  return settle(game, 'push');
}

// Calcule le gain. payout = ce qui est RENDU au joueur (mise incluse).
function settle(game, outcome) {
  game.outcome = outcome;
  if (outcome === 'win' || outcome === 'blackjack') {
    game.mult = randomMult();
    game.payout = Math.floor(game.bet * game.mult);
  } else if (outcome === 'push') {
    game.payout = game.bet; // mise rendue
  } else {
    game.payout = 0; // perdu
  }
  return game;
}

// Probabilités approximatives (référence pour le menu), croupier tire jusqu'à 17.
export const BJ_INFO = {
  winRate: 42.4,
  pushRate: 8.5,
  loseRate: 49.1,
  note: 'Croupier tire jusqu\'à 17. Victoire payée × un multiplicateur aléatoire 2.00–2.80.',
};

// ---------------- MODE JOUEUR CONTRE JOUEUR (table publique) ----------------
// Chaque joueur a une main ; le plus proche de 21 sans dépasser gagne la
// cagnotte. Égalité = partage. Tout le monde saute = personne ne gagne.
export function dealPvpHand() {
  return [drawCard(), drawCard()];
}

export function hitPvp(player) {
  player.hand.push(drawCard());
  if (handValue(player.hand) > 21) player.status = 'done';
  return player;
}

export function resolvePvp(players) {
  const vivants = players.filter((p) => handValue(p.hand) <= 21);
  if (vivants.length === 0) return { allBust: true, winners: [], best: 0 };
  const best = Math.max(...vivants.map((p) => handValue(p.hand)));
  const winners = vivants.filter((p) => handValue(p.hand) === best).map((p) => p.userId);
  return { allBust: false, winners, best };
}
