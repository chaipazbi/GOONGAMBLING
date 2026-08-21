// Jeu de cartes pour le blackjack (tirage infini : chaque carte est tirée
// indépendamment, comme un sabot de très nombreux paquets — simple et sans
// épuisement).
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export function drawCard() {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit };
}

export function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

export function handLabel(cards, hideSecond = false) {
  if (hideSecond) return `${cardLabel(cards[0])} 🂠`;
  return cards.map(cardLabel).join(' ');
}

// Valeur d'une main au blackjack (les As comptent 11 puis 1 si dépassement).
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(c.rank)) {
      total += 10;
    } else {
      total += parseInt(c.rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

export function isBust(cards) {
  return handValue(cards) > 21;
}

// Main "molle" : un As encore compté comme 11.
export function isSoft(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(c.rank)) {
      total += 10;
    } else {
      total += parseInt(c.rank, 10);
    }
  }
  return aces > 0 && total <= 21;
}
